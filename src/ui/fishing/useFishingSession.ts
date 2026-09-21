import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadBuiltInContent } from '../../content/catalog'
import {
  FishingEngine,
  isTerminalPhase,
  type FishingCommand,
  type FishingSnapshot,
} from '../../domain/fishing'
import { resolveFishingModifiers } from '../../domain/progression'
import { usePlayerStore } from '../../state/playerStore'

/**
 * 釣行 1 回分のセッション。
 *
 * Domain の FishingEngine を保持し、UI 側の都合（tick の刻み、再描画、
 * セッションの作り直し）だけを担当する。
 *
 * 捕獲の処理（記録と成長）は playerStore 経由で Domain の resolveCatch に渡す。
 * ここでは First Catch も自己記録も判定しない。
 */

export type FishingSession = {
  readonly contentError: string | null
  readonly snapshot: FishingSnapshot | null
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

  const progression = usePlayerStore((state) => state.progression)
  const recordCatch = usePlayerStore((state) => state.recordCatch)

  // コンテンツは起動時に 1 度だけ検証する。
  const content = useMemo(() => {
    try {
      return { ok: true as const, value: loadBuiltInContent() }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }, [])

  // 技量は Progression 側で解決してから Engine へ渡す。
  const playerModifiers = useMemo(
    () =>
      resolveFishingModifiers({
        skills: progression.skills,
        perks: progression.unlockedPerks,
      }),
    [progression.skills, progression.unlockedPerks],
  )

  // セッション開始（内容・seed・技量が変わったとき）。
  useEffect(() => {
    if (!content.ok) {
      return
    }

    const engine = new FishingEngine({
      encounters: content.value.encounters,
      seed: session.seed,
      spotId: content.value.primarySpot.id,
      playerModifiers,
    })

    engineRef.current = engine
    setSnapshot(engine.snapshot())
  }, [content, session, playerModifiers])

  const isRunning = snapshot !== null && !isTerminalPhase(snapshot.phase)

  // tick を刻む。終了状態では止める。
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

      // 取り込んだ瞬間だけ記録・成長を反映する（LANDED は 1 回しか出ない）。
      if (result.events.includes('LANDED') && content.ok) {
        const individual = result.snapshot.fish?.individual
        const species =
          individual === undefined
            ? undefined
            : content.value.speciesById[String(individual.speciesId)]

        if (individual !== undefined && species !== undefined) {
          recordCatch({
            individual,
            species,
            spotId: String(content.value.primarySpot.id),
            capturedAt: new Date().toISOString(),
          })
        }
      }
    }, engine.tuning.tickMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [isRunning, session, content, recordCatch])

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
    seed: session.seed,
    send,
    restart,
  }
}
