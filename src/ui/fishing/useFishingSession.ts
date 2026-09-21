import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EncounterCandidate } from '../../domain/encounter/encounterEngine'
import {
  FishingEngine,
  isTerminalPhase,
  type FishingCommand,
  type FishingSnapshot,
} from '../../domain/fishing'
import type { FishingEvent } from '../../domain/fishing'
import { resolveFishingModifiers } from '../../domain/progression'
import { composeFishingModifiers, resolveTackle } from '../../domain/tackle'
import { usePlayerStore } from '../../state/playerStore'
import { useContentOrError } from '../world/useContentOrError'

/**
 * 釣行 1 回分のセッション。
 *
 * どの魚が釣れるかは「今いる Spot の fishTable」で決まる。
 * FishingEngine 自身は Spot を知らない（Encounter 候補を渡されるだけ）。
 *
 * 1 回の釣り（キャスト〜結果）が終わったら、その結果を World へ返す:
 *   時間が進み、Knowledge が増える（釣れなくても）。
 */

/** 1 回の釣りが終わったことを示すイベント。 */
const SESSION_END_EVENTS: readonly FishingEvent[] = [
  'LANDED',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'NO_BITE',
]

export type FishingSession = {
  readonly contentError: string | null
  readonly snapshot: FishingSnapshot | null
  readonly spotName: string | null
  /** このセッションの seed。同じ seed なら同じ経過を再現できる。 */
  readonly seed: string
  readonly send: (command: FishingCommand) => void
  /** 新しい seed でやり直す。seed を渡すと同じ経過を再挑戦できる。 */
  readonly restart: (seed?: string) => void
}

const createSessionSeed = (): string => `s${Date.now().toString(36)}`

export const useFishingSession = (): FishingSession => {
  const [session, setSession] = useState(() => ({ seed: createSessionSeed(), nonce: 0 }))
  const engineRef = useRef<FishingEngine | null>(null)
  const [snapshot, setSnapshot] = useState<FishingSnapshot | null>(null)

  const content = useContentOrError()
  const world = usePlayerStore((state) => state.world)
  const progression = usePlayerStore((state) => state.progression)
  const loadout = usePlayerStore((state) => state.loadout)
  const recordCatch = usePlayerStore((state) => state.recordCatch)
  const recordAttempt = usePlayerStore((state) => state.recordAttempt)

  const spot = useMemo(() => {
    if (!content.ok || world.currentSpotId === null) {
      return undefined
    }

    return content.value.spots.find((entry) => entry.id === world.currentSpotId)
  }, [content, world.currentSpotId])

  // 今いる Spot の魚種だけが Encounter 候補になる。
  const encounters = useMemo<readonly EncounterCandidate[]>(() => {
    if (!content.ok || spot === undefined) {
      return []
    }

    return spot.fishTable.flatMap((occurrence) => {
      const species = content.value.speciesById[String(occurrence.speciesId)]

      return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
    })
  }, [content, spot])

  // 技量は Progression 側で解決する。
  const skillModifiers = useMemo(
    () =>
      resolveFishingModifiers({
        skills: progression.skills,
        perks: progression.unlockedPerks,
      }),
    [progression.skills, progression.unlockedPerks],
  )

  /*
   * 装備は Tackle 側で解決する。
   * Engine へは「合成済みの倍率」と「Encounter の重み付け」だけを渡し、
   * Gear の名前もカテゴリも見せない。
   */
  const tackle = useMemo(() => {
    if (!content.ok) {
      return null
    }

    return resolveTackle({
      loadout,
      gear: content.value.gear,
      methods: content.value.methods,
    })
  }, [content, loadout])

  const playerModifiers = useMemo(
    () =>
      tackle === null
        ? skillModifiers
        : composeFishingModifiers(skillModifiers, tackle.playerModifiers),
    [skillModifiers, tackle],
  )

  const encounterProfile = useMemo(() => {
    if (tackle === null) {
      return undefined
    }

    return {
      methodId: tackle.encounterProfile.methodId,
      offeringTags: tackle.encounterProfile.offeringTags,
      biteAffinity: tackle.encounterProfile.biteAffinity,
    }
  }, [tackle])

  const encountersKey = spot === undefined ? 'none' : String(spot.id)

  // セッション開始（Spot・seed・技量が変わったとき）。
  useEffect(() => {
    if (!content.ok || spot === undefined) {
      engineRef.current = null
      setSnapshot(null)
      return
    }

    const engine = new FishingEngine({
      encounters,
      seed: session.seed,
      spotId: spot.id,
      playerModifiers,
      ...(encounterProfile === undefined ? {} : { encounterProfile }),
    })

    engineRef.current = engine
    setSnapshot(engine.snapshot())
  }, [content, session, playerModifiers, encounterProfile, encounters, encountersKey, spot])

  const isRunning = snapshot !== null && !isTerminalPhase(snapshot.phase)

  useEffect(() => {
    if (!isRunning) {
      return
    }

    const engine = engineRef.current

    if (engine === null) {
      return
    }

    const interval = window.setInterval(() => {
      const result = engine.tick()
      setSnapshot(result.snapshot)

      const ended = result.events.find((event) => SESSION_END_EVENTS.includes(event))

      if (ended === undefined || spot === undefined) {
        return
      }

      const landed = ended === 'LANDED'
      const individual = result.snapshot.fish?.individual

      // LANDED のときだけ記録と成長を反映する。
      if (landed && individual !== undefined && content.ok) {
        const species = content.value.speciesById[String(individual.speciesId)]

        if (species !== undefined) {
          recordCatch({
            individual,
            species,
            spotId: String(spot.id),
            capturedAt: new Date().toISOString(),
          })
        }
      }

      // 釣れても釣れなくても時間は進み、Knowledge も増える。
      const xpGained = landed ? (usePlayerStore.getState().lastCatch?.xpGained ?? 0) : 0

      recordAttempt({
        spot,
        outcome: landed ? 'landed' : 'failed',
        xpGained,
        ...(landed && individual !== undefined ? { caughtLengthCm: individual.lengthCm } : {}),
      })
    }, engine.tuning.tickMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [isRunning, session, content, recordCatch, recordAttempt, spot, encountersKey])

  const send = useCallback((command: FishingCommand) => {
    const engine = engineRef.current

    if (engine === null) {
      return
    }

    setSnapshot(engine.dispatch(command).snapshot)
  }, [])

  const restart = useCallback((seed?: string) => {
    setSession((previous) => ({
      seed: seed ?? createSessionSeed(),
      nonce: previous.nonce + 1,
    }))
  }, [])

  return {
    contentError: content.ok ? null : content.message,
    snapshot,
    spotName: spot?.name ?? null,
    seed: session.seed,
    send,
    restart,
  }
}
