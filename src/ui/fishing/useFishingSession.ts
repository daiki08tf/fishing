import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EncounterCandidate } from '../../domain/encounter/encounterEngine'
import {
  FishingEngine,
  isTerminalPhase,
  resolveAbrasionRisk,
  resolveFightCapability,
  type FightCapability,
  type FishingCommand,
  type FishingSnapshot,
} from '../../domain/fishing'
import type { FishingEvent } from '../../domain/fishing'
import { resolveFishingModifiers } from '../../domain/progression'
import { resolveEnvironment, resolveFishingConditions } from '../../domain/environment'
import type { EnvironmentSnapshot, FishingConditions } from '../../domain/environment'
import {
  DEFAULT_GEAR_TUNING,
  bestFishFinderOf,
  composeFishingModifiers,
  resolveGearForLoadout,
  resolveTackle,
} from '../../domain/tackle'
import {
  fishingZonesForSpot,
  resolveCast,
  resolveCastCapability,
  zoneAffinityMultiplier,
  type CastCapability,
  type ResolvedCast,
} from '../../domain/casting'
import {
  depthToFightDistanceM,
  resolveDepthCapability,
  resolveDeployment,
  resolveDriftStrength,
  resolveFishingPlatform,
  resolveMarineReadiness,
  resolveSeaState,
  type DepthCapability,
  type FishingPlatformContext,
  type MarineReadinessResult,
  type ResolvedDeployment,
  type SeaState,
} from '../../domain/depth'
import type { FishingSpot, FishingZone } from '../../domain/world/FishingSpot'
import {
  methodSupportsPlatform,
  presentationOf,
  type PresentationMode,
} from '../../domain/method/FishingMethod'
import { SeededRandomSource } from '../../domain/rng/SeededRandomSource'
import { resolveBiteCompatibility } from '../../domain/tackle/biteCompatibility'
import type { FishSpecies } from '../../domain/fish/FishSpecies'
import { spotKnowledgeScore } from '../../domain/knowledge/spotKnowledge'
import { NEUTRAL_FISHING_MODIFIERS } from '../../domain/fishing/PlayerFishingModifiers'
import { usePlayerStore } from '../../state/playerStore'
import { useContentOrError } from '../world/useContentOrError'
import { resolveCanCast } from './canCast'

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
  'SPOOLED',
  'NO_BITE',
]

export type FishingSession = {
  readonly contentError: string | null
  readonly snapshot: FishingSnapshot | null
  readonly spot: FishingSpot | undefined
  readonly spotName: string | null
  /** Phase 9: 今の環境と釣況（UI 表示用）。 */
  readonly environment: EnvironmentSnapshot | null
  readonly conditions: FishingConditions | null
  /** このセッションの seed。同じ seed なら同じ経過を再現できる。 */
  readonly seed: string
  /** Phase 11: Spot 内で狙える水域。 */
  readonly fishingZones: readonly FishingZone[]
  readonly targetZoneId: string | null
  readonly castCapability: CastCapability | null
  readonly resolvedCast: ResolvedCast | null
  /** Phase 17A: 今回の Transport から derive した Fishing Platform（船 / カヤック / 岸）。 */
  readonly platform: FishingPlatformContext
  /** Phase 17A: 狙う水域が depth-only Zone のときだけ埋まる。 */
  readonly depthCapability: DepthCapability | null
  readonly resolvedDeployment: ResolvedDeployment | null
  readonly seaState: SeaState | null
  readonly marineReadiness: MarineReadinessResult | null
  /** Phase 18A: 今のタックルの戦闘能力（派生値・Save しない）。 */
  readonly fightCapability: FightCapability | null
  readonly canCast: boolean
  /** Phase 17B: 今の釣法がこの Platform で使えないときだけ false。 */
  readonly methodPlatformOk: boolean
  /** Phase 17B: 今の釣法の提示方式（投げる/落とす/流す/曳き始める のどれか）。 */
  readonly presentationMode: PresentationMode
  readonly selectTargetZone: (zoneId: string) => void
  readonly send: (command: FishingCommand) => void
  /** 新しい seed でやり直す。seed を渡すと同じ経過を再挑戦できる。 */
  readonly restart: (seed?: string) => void
}

const createSessionSeed = (): string => `s${Date.now().toString(36)}`

export const useFishingSession = (): FishingSession => {
  const [session, setSession] = useState(() => ({ seed: createSessionSeed(), nonce: 0 }))
  const [targetZoneId, setTargetZoneId] = useState<string | null>(null)
  const engineRef = useRef<FishingEngine | null>(null)
  const [snapshot, setSnapshot] = useState<FishingSnapshot | null>(null)

  const content = useContentOrError()
  const world = usePlayerStore((state) => state.world)
  const progression = usePlayerStore((state) => state.progression)
  const loadout = usePlayerStore((state) => state.loadout)
  const inventory = usePlayerStore((state) => state.inventory)
  const knowledge = usePlayerStore((state) => state.knowledge)
  const lastSearch = usePlayerStore((state) => state.lastSearch)
  const recordCatch = usePlayerStore((state) => state.recordCatch)
  const recordAttempt = usePlayerStore((state) => state.recordAttempt)

  const spot = useMemo(() => {
    if (!content.ok || world.currentSpotId === null) {
      return undefined
    }

    return content.value.spots.find((entry) => entry.id === world.currentSpotId)
  }, [content, world.currentSpotId])

  const fishingZones = useMemo(() => (spot === undefined ? [] : fishingZonesForSpot(spot)), [spot])
  const activeTargetZoneId =
    targetZoneId !== null && fishingZones.some((zone) => zone.id === targetZoneId)
      ? targetZoneId
      : (fishingZones[0]?.id ?? null)

  /** 今いる Spot の魚種（Encounter 候補の元）。 */
  const species = useMemo<readonly FishSpecies[]>(() => {
    if (!content.ok || spot === undefined) {
      return []
    }

    return spot.fishTable.flatMap((occurrence) => {
      const found = content.value.speciesById[String(occurrence.speciesId)]
      return found === undefined ? [] : [found]
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

  const castingGear = useMemo(() => {
    if (!content.ok) {
      return null
    }

    return resolveGearForLoadout(loadout, content.value.gear)
  }, [content, loadout])

  /*
   * Phase 18A: タックルの戦闘能力（ライン容量 / ドラグ / weak link など）。
   * Save しない派生値。Engine へはこの解決済み DTO だけを渡す
   * （Engine は Gear を知らない）。
   */
  const fightCapability = useMemo<FightCapability | null>(
    () => (castingGear === null ? null : resolveFightCapability(castingGear)),
    [castingGear],
  )

  /*
   * Phase 17A: Fishing Platform は Save しない派生値。
   * 今回の釣行で使った Transport（world.trip.transportId）から毎回 derive する。
   */
  const platform = useMemo<FishingPlatformContext>(() => {
    const transportId = world.trip?.transportId ?? null
    const transport =
      !content.ok || transportId === null
        ? null
        : (content.value.transportById[String(transportId)] ?? null)

    return resolveFishingPlatform(transport)
  }, [content, world.trip])

  /*
   * Phase 9: 環境（季節 / 時間 / 天候 / 潮 / 水）を解決し、
   * 釣況（Encounter 重み・Fight 倍率）へ写す。
   * Engine へは解決済みの数値だけを渡す（雨・潮・国は見せない）。
   */
  const environment = useMemo(() => {
    if (!content.ok || spot === undefined) {
      return null
    }

    const region = content.value.regionById[String(spot.regionId)]

    if (region === undefined) {
      return null
    }

    return resolveEnvironment({
      time: world.time,
      climate: region.climate,
      regionId: String(region.id),
      environment: spot.environment,
      tideDrivenFlow: spot.tideDrivenFlow,
    })
  }, [content, spot, world.time])

  const castCapability = useMemo<CastCapability | null>(() => {
    if (castingGear === null) {
      return null
    }

    return resolveCastCapability({
      rod: castingGear.rod,
      reel: castingGear.reel,
      line: castingGear.line,
      offering: castingGear.offering,
      methodCastDistance: DEFAULT_GEAR_TUNING.methods[loadout.methodId]?.castDistance ?? 0.5,
      skillCastingMultiplier: skillModifiers.castingPrecisionMultiplier,
      windy: environment?.weather === 'windy',
    })
  }, [castingGear, loadout.methodId, skillModifiers.castingPrecisionMultiplier, environment])

  const resolvedCast = useMemo<ResolvedCast | null>(() => {
    if (
      castCapability === null ||
      activeTargetZoneId === null ||
      fishingZones.length === 0 ||
      spot === undefined
    ) {
      return null
    }

    return resolveCast({
      zones: fishingZones,
      targetZoneId: activeTargetZoneId,
      capability: castCapability,
      random: new SeededRandomSource(
        `${session.seed}:cast:${String(spot.id)}:${activeTargetZoneId}`,
      ),
    })
  }, [castCapability, activeTargetZoneId, fishingZones, session.seed, spot])

  /*
   * Phase 17A: castDistanceM を持たない（= 船の真下などを表す）Zone は、
   * 水平キャストではなく水深で狙う。既存の resolvedCast は変更しない
   * （castDistanceM を持つ Zone は今までどおり Casting Domain だけを通る）。
   */
  const activeZone = fishingZones.find((zone) => zone.id === activeTargetZoneId) ?? null
  const isDepthTargetZone =
    activeZone !== null &&
    activeZone.castDistanceM === undefined &&
    activeZone.depthRangeM !== undefined

  const depthCapability = useMemo<DepthCapability | null>(() => {
    if (!platform.canPresentVertically || castingGear === null || !isDepthTargetZone) {
      return null
    }

    return resolveDepthCapability({
      reel: castingGear.reel,
      line: castingGear.line,
      offering: castingGear.offering,
      platform: platform.platform,
      skillControlMultiplier: skillModifiers.castingPrecisionMultiplier,
    })
  }, [platform, castingGear, isDepthTargetZone, skillModifiers.castingPrecisionMultiplier])

  const resolvedDeployment = useMemo<ResolvedDeployment | null>(() => {
    if (
      depthCapability === null ||
      activeTargetZoneId === null ||
      fishingZones.length === 0 ||
      spot === undefined
    ) {
      return null
    }

    return resolveDeployment({
      zones: fishingZones,
      targetZoneId: activeTargetZoneId,
      capability: depthCapability,
      random: new SeededRandomSource(
        `${session.seed}:depth:${String(spot.id)}:${activeTargetZoneId}`,
      ),
      drift: resolveDriftStrength(spot.current),
    })
  }, [depthCapability, activeTargetZoneId, fishingZones, session.seed, spot])

  const seaState = useMemo<SeaState | null>(
    () => (environment === null ? null : resolveSeaState(environment)),
    [environment],
  )

  const marineReadiness = useMemo<MarineReadinessResult | null>(
    () => (seaState === null ? null : resolveMarineReadiness(platform.platform, seaState)),
    [platform.platform, seaState],
  )

  const finder = content.ok ? bestFishFinderOf(inventory, content.value.gear) : null
  const searchSign =
    lastSearch !== null && spot !== undefined && lastSearch.spotId === String(spot.id)
      ? lastSearch.sign
      : null

  const conditions = useMemo(() => {
    if (environment === null) {
      return null
    }

    return resolveFishingConditions({
      environment,
      species,
      tackleModifiers: tackle?.playerModifiers ?? NEUTRAL_FISHING_MODIFIERS,
      hasFishFinder: finder !== null,
      searchSign,
      knowledgeScore: spot === undefined ? 0 : spotKnowledgeScore(knowledge, String(spot.id)),
    })
  }, [environment, species, tackle, finder, searchSign, knowledge, spot])

  // 今いる Spot の魚種だけが Encounter 候補になる（環境の重みを掛ける）。
  const encounters = useMemo<readonly EncounterCandidate[]>(() => {
    if (spot === undefined || !content.ok) {
      return []
    }

    /*
     * Phase 9.1: Catchability is soft by default.
     * 物理的に不可能（offering / hook が大きすぎる）場合だけ候補の Bite を 0 にし、
     * それ以外は相性として multiplier で扱う（魚はそこにいるが食いにくい）。
     */
    const offering = content.value.gearById[String(loadout.offeringId)] ?? null
    const hook = content.value.gearById[String(loadout.hookId)] ?? null
    const rod = content.value.gearById[String(loadout.rodId)] ?? null

    return spot.fishTable.flatMap((occurrence) => {
      const found = species.find((entry) => entry.id === occurrence.speciesId)

      if (found === undefined) {
        return []
      }

      const environmentWeight = conditions?.speciesModifiers[String(found.id)] ?? 1
      const landedZoneId = isDepthTargetZone
        ? resolvedDeployment !== null && resolvedDeployment.reachable
          ? resolvedDeployment.landedZoneId
          : activeTargetZoneId
        : resolvedCast !== null && resolvedCast.reachable
          ? resolvedCast.landedZoneId
          : activeTargetZoneId
      const zoneWeight =
        landedZoneId === null ? 1 : zoneAffinityMultiplier(occurrence, landedZoneId)
      const bite = resolveBiteCompatibility({
        species: found,
        offering,
        hook,
        rod,
        methodId: loadout.methodId,
      })

      return [
        {
          species: found,
          presence: occurrence.basePresence * environmentWeight * zoneWeight,
          biteEligible: bite.eligible,
          affinityMultiplier: bite.affinityMultiplier,
          hookSuccessModifier: bite.hookSuccessModifier,
          hookRetentionMultiplier: bite.hookRetentionMultiplier,
        },
      ]
    })
  }, [
    spot,
    species,
    conditions,
    content,
    loadout,
    resolvedCast,
    activeTargetZoneId,
    isDepthTargetZone,
    resolvedDeployment,
  ])

  const playerModifiers = useMemo(() => {
    const base =
      tackle === null
        ? skillModifiers
        : composeFishingModifiers(skillModifiers, tackle.playerModifiers)

    return conditions === null ? base : composeFishingModifiers(base, conditions.playerModifiers)
  }, [skillModifiers, tackle, conditions])

  const encounterProfile = useMemo(() => {
    if (tackle === null) {
      return undefined
    }

    return {
      methodId: tackle.encounterProfile.methodId,
      offeringTags: tackle.encounterProfile.offeringTags,
      biteAffinity:
        tackle.encounterProfile.biteAffinity * (conditions?.biteAffinityMultiplier ?? 1),
    }
  }, [tackle, conditions])

  const encountersKey =
    spot === undefined ? 'none' : `${String(spot.id)}:${activeTargetZoneId ?? 'no-zone'}`

  /*
   * Phase 17A: 狙う水域が depth-only Zone なら、水深をファイト距離へ圧縮した値を使う
   * （100m の水深がそのまま 100 step の REEL にはならない）。
   * それ以外は既存どおり Casting Domain の actualDistanceM を使う。
   */
  const initialFightDistanceM = isDepthTargetZone
    ? resolvedDeployment !== null && resolvedDeployment.reachable
      ? depthToFightDistanceM(resolvedDeployment.actualDepthM)
      : undefined
    : resolvedCast !== null && resolvedCast.reachable
      ? resolvedCast.actualDistanceM
      : undefined

  /*
   * Phase 18B: 物理ライン。gameplay 距離（initialFightDistanceM）とは別に、
   * スプールから実際に出ているライン量を渡す。
   * - キャスト: 実着水距離（水平距離 ≈ 出ているライン）
   * - 垂直: 実水深 + スコープ（船から斜めに出る分を 15% 見る）
   */
  const initialLineOutM = isDepthTargetZone
    ? resolvedDeployment !== null && resolvedDeployment.reachable
      ? Math.round(resolvedDeployment.actualDepthM * 1.15)
      : undefined
    : resolvedCast !== null && resolvedCast.reachable
      ? resolvedCast.actualDistanceM
      : undefined

  /*
   * Phase 18B: 根ズレリスク。狙った（着底した）Zone の habitatTags から
   * 解決する。Engine は Zone を知らないので数値だけ渡す。
   */
  const abrasionRisk = useMemo(() => {
    const landedZoneId = isDepthTargetZone
      ? resolvedDeployment !== null && resolvedDeployment.reachable
        ? resolvedDeployment.landedZoneId
        : activeTargetZoneId
      : resolvedCast !== null && resolvedCast.reachable
        ? resolvedCast.landedZoneId
        : activeTargetZoneId
    const zone = fishingZones.find((entry) => entry.id === landedZoneId)

    return zone === undefined ? 0 : resolveAbrasionRisk(zone.habitatTags)
  }, [isDepthTargetZone, resolvedDeployment, resolvedCast, activeTargetZoneId, fishingZones])

  /*
   * セッションの入力（Encounter・倍率・Knowledge）。
   *
   * これらは釣行の途中で「釣果を記録した副作用」としても変わる
   * （世界時間 → Environment → Conditions、成長 → 倍率）。
   * Engine を毎回作り直すと、取り込んだ瞬間に画面が最初の状態へ戻ってしまうため、
   * 最新値は ref に置き、**セッションを開始するときだけ**読む。
   */
  const sessionInputsRef = useRef({
    encounters,
    playerModifiers,
    encounterProfile,
    knowledgeScore: spotKnowledgeScore(knowledge, spot === undefined ? '' : String(spot.id)),
    initialFightDistanceM,
    fightCapability,
    initialLineOutM,
    abrasionRisk,
  })
  sessionInputsRef.current = {
    encounters,
    playerModifiers,
    encounterProfile,
    knowledgeScore: spotKnowledgeScore(knowledge, spot === undefined ? '' : String(spot.id)),
    initialFightDistanceM,
    fightCapability,
    initialLineOutM,
    abrasionRisk,
  }

  // セッション開始（Spot・seed が変わったとき）。釣行中は作り直さない。
  useEffect(() => {
    if (!content.ok || spot === undefined) {
      engineRef.current = null
      setSnapshot(null)
      return
    }

    const inputs = sessionInputsRef.current
    const engine = new FishingEngine({
      encounters: inputs.encounters,
      seed: session.seed,
      spotId: spot.id,
      playerModifiers: inputs.playerModifiers,
      // Phase 10: Knowledge は予兆（telegraph）の文章精度にだけ効く。
      knowledgeScore: inputs.knowledgeScore,
      ...(inputs.initialFightDistanceM === undefined
        ? {}
        : { initialFightDistanceM: inputs.initialFightDistanceM }),
      ...(inputs.encounterProfile === undefined
        ? {}
        : { encounterProfile: inputs.encounterProfile }),
      ...(inputs.fightCapability === null ? {} : { fightCapability: inputs.fightCapability }),
      ...(inputs.initialLineOutM === undefined ? {} : { initialLineOutM: inputs.initialLineOutM }),
      abrasionRisk: inputs.abrasionRisk,
    })

    engineRef.current = engine
    setSnapshot(engine.snapshot())
  }, [content, session, spot, encountersKey])

  /*
   * Phase 10: FIGHTING / LANDING はコマンド駆動（完全ターン制）。
   * tick は進めない（連打や待ち時間で有利にならない）。
   */
  const isRunning =
    snapshot !== null &&
    !isTerminalPhase(snapshot.phase) &&
    snapshot.phase !== 'FIGHTING' &&
    snapshot.phase !== 'LANDING'

  /*
   * 釣行の終わり（LANDED / 失敗）を世界へ反映する。
   *
   * Phase 10: 取り込みは最後の 1 コマンド（LAND）で決まる。
   * tick でもコマンドでも同じ処理を通すために 1 か所へまとめる。
   */
  const resolveSessionEnd = useCallback(
    (events: readonly FishingEvent[], final: FishingSnapshot): void => {
      const ended = events.find((event) => SESSION_END_EVENTS.includes(event))

      if (ended === undefined || spot === undefined) {
        return
      }

      const landed = ended === 'LANDED'
      const individual = final.fish?.individual

      // LANDED のときだけ記録と成長を反映する。
      if (landed && individual !== undefined && content.ok) {
        const caughtSpecies = content.value.speciesById[String(individual.speciesId)]

        if (caughtSpecies !== undefined) {
          recordCatch({
            individual,
            species: caughtSpecies,
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
    },
    [content, recordAttempt, recordCatch, spot],
  )

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
      resolveSessionEnd(result.events, result.snapshot)
    }, engine.tuning.tickMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [isRunning, session, encountersKey, resolveSessionEnd])

  /*
   * Phase 17B: 今の釣法がこの Platform で物理的に成立するか
   * （例: トローリングは船が動いていないと成立しない）。Method ID / Platform ID の
   * 分岐ではなく、Content の presentation.supportedPlatforms から判定する。
   */
  const methodPlatformOk =
    tackle === null || methodSupportsPlatform(tackle.method, platform.platform)
  const presentationMode: PresentationMode =
    tackle === null ? 'cast' : presentationOf(tackle.method).mode

  const canCast = resolveCanCast({
    methodPlatformOk,
    marineReadiness,
    isDepthTargetZone,
    resolvedCast,
    resolvedDeployment,
  })

  const send = useCallback(
    (command: FishingCommand) => {
      const engine = engineRef.current

      if (engine === null || (command === 'cast' && !canCast)) {
        return
      }

      const outcome = engine.dispatch(command)
      setSnapshot(outcome.snapshot)

      /*
       * Phase 10: FIGHTING / LANDING は tick では進まない。
       * 最後の LAND もコマンドなので、ここでも終了処理を通す。
       */
      if (outcome.accepted) {
        resolveSessionEnd(outcome.events, outcome.snapshot)
      }
    },
    [canCast, resolveSessionEnd],
  )

  const selectTargetZone = useCallback(
    (zoneId: string) => {
      if (fishingZones.some((zone) => zone.id === zoneId)) {
        setTargetZoneId(zoneId)
      }
    },
    [fishingZones],
  )

  const restart = useCallback((seed?: string) => {
    setSession((previous) => ({
      seed: seed ?? createSessionSeed(),
      nonce: previous.nonce + 1,
    }))
  }, [])

  return {
    contentError: content.ok ? null : content.message,
    snapshot,
    spot,
    spotName: spot?.name ?? null,
    environment,
    conditions,
    seed: session.seed,
    fishingZones,
    targetZoneId: activeTargetZoneId,
    castCapability,
    resolvedCast,
    platform,
    depthCapability,
    resolvedDeployment,
    seaState,
    marineReadiness,
    fightCapability,
    canCast,
    methodPlatformOk,
    presentationMode,
    selectTargetZone,
    send,
    restart,
  }
}
