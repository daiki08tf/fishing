import { pathToFileURL } from 'node:url'
import { loadFixtureContent, SAMPLE_SPECIES } from '../tests/fixtures/content'
import type { BuiltInContent } from '../src/content/catalog/assembleContent'
import type { GearItem, RodDefinition } from '../src/domain/gear/Gear'
import { FishingEngine, resolveFightCapability, type FightCapability } from '../src/domain/fishing'
import { fishingZonesForSpot, resolveCast, resolveCastCapability } from '../src/domain/casting'
import {
  depthToFightDistanceM,
  resolveDeployment,
  resolveDepthCapability,
  resolveDriftStrength,
  resolveFishingPlatform,
} from '../src/domain/depth'
import { SeededRandomSource } from '../src/domain/rng'
import { createInitialProgression, resolveFishingModifiers } from '../src/domain/progression'
import {
  DEFAULT_GEAR_TUNING,
  composeFishingModifiers,
  resolveGearForLoadout,
  resolveTackle,
} from '../src/domain/tackle'
import type { Loadout } from '../src/domain/tackle'
import { runFishingToTerminal } from './simulate-fishing'

/**
 * 大型魚のファイト比較（Phase 9）。
 *
 *   Light / Balanced / Heavy のタックルで Chinook / Halibut を多数回ファイトし、
 *   着地率・ラインブレイク率・フックアウト率・平均 tick を比較する。
 *
 * 期待:
 * - 大型魚では Heavy > Balanced > Light（着地の安定度）
 * - 小型魚では Heavy が万能ではない（軽いタックルの方が掛けて獲れる）
 * - 0% / 100% に張り付かない（理論上は軽くても獲れる）
 *
 * 装備はすべて既存の Gear catalog から実スペックで選ぶ（具体 ID の分岐はしない）。
 */

const ATTEMPTS = 200

export type BigGameCheck = {
  readonly label: string
  readonly ok: boolean
}

export type BigGameResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly BigGameCheck[]
  readonly fingerprint: string
}

type Outcome = 'no_bite' | 'hook_missed' | 'hook_escape' | 'line_break' | 'spooled' | 'landed'

type FightRecord = {
  readonly outcome: Outcome
  readonly ticks: number
  /** FIGHTING 中のプレイヤー決定数（1 コマンド = 1 step）。 */
  readonly battleSteps: number
  readonly lengthCm: number
}

type Setup = {
  readonly label: string
  readonly loadout: Loadout
  /** 実 Content から解決した戦闘能力（診断表示にも使う）。 */
  readonly capability: FightCapability
}

type Stats = {
  readonly label: string
  /** Bite があった回数（hook_missed を含む、no_bite 以外すべて）。 */
  readonly bites: number
  /** 実際に Text Battle に入った回数（battleSteps > 0）。 */
  readonly fights: number
  readonly landed: number
  readonly lineBreak: number
  readonly spooled: number
  readonly hookEscape: number
  /** アワセに失敗し Text Battle に入らなかった回数。 */
  readonly hookMissed: number
  readonly noBite: number
  readonly avgTicks: number
  /** fights（battleSteps > 0）だけのバトル決定数（平均 / p50 / p90 / p95）。 */
  readonly avgBattleSteps: number
  readonly p50BattleSteps: number
  readonly p90BattleSteps: number
  readonly p95BattleSteps: number
  readonly avgLengthCm: number
  /** landed / fights。HOOK_MISSED は分母に入れない。 */
  readonly landedRateOfFights: number
  readonly landedPerCast: number
}

const percentileOf = (sorted: readonly number[], ratio: number): number => {
  if (sorted.length === 0) {
    return 0
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))

  return sorted[index] as number
}

const percentile = <T>(items: readonly T[], ratio: number, value: (item: T) => number): T => {
  const sorted = [...items].sort((left, right) => value(left) - value(right))
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))

  return sorted[index] as T
}

/**
 * ロッドのパワー帯と「装備の価格帯（0〜1）」から Loadout を組む。
 *
 * 具体 ID を書かず、Content の実スペック（価格・maxDragKg・strengthKg・weightG）から選ぶ。
 * simulate:big-game と simulate:text-battle が同じ物差しを使うために共有する。
 */
export const buildTackleLoadout = (input: {
  readonly content: BuiltInContent
  readonly rodPower: RodDefinition['power']
  readonly gearRatio: number
  /** 部品ごとの percentile override（Spool シナリオなど）。 */
  readonly overrides?: Partial<
    Record<'rod' | 'reel' | 'line' | 'leader' | 'hook' | 'offering', number>
  >
  /**
   * Reel の並べ替え指標。'drag'（既定）は maxDragKg、
   * 'capacity' は容量テーブルの最大容量（小容量リールを選ぶ Spool シナリオ用）。
   */
  readonly reelSort?: 'drag' | 'capacity'
}): Loadout => {
  const rods = input.content.gear.filter((item): item is RodDefinition => item.category === 'rod')
  const reels = input.content.gear.filter((item) => item.category === 'reel')
  const lineGear = input.content.gear.filter((item) => item.category === 'line')
  const leaderGear = input.content.gear.filter((item) => item.category === 'leader')
  const hooks = input.content.gear.filter((item) => item.category === 'hook')
  const lures = input.content.gear.filter((item) => item.category === 'lure')
  const pick = (
    items: readonly GearItem[],
    ratio: number,
    value: (item: GearItem) => number,
  ): GearItem => percentile(items, ratio, value)

  const rodCandidates = rods.filter((rod) => rod.power === input.rodPower)
  const rod = pick(
    rodCandidates.length === 0 ? rods : rodCandidates,
    input.overrides?.rod ?? 0.5,
    (item) => item.price,
  ) as RodDefinition
  const reel = pick(reels, input.overrides?.reel ?? input.gearRatio, (item) =>
    item.category === 'reel'
      ? input.reelSort === 'capacity'
        ? Math.max(0, ...item.lineCapacity.map((entry) => entry.capacityM))
        : item.maxDragKg
      : 0,
  )
  const line = pick(lineGear, input.overrides?.line ?? input.gearRatio, (item) =>
    item.category === 'line' ? item.strengthKg : 0,
  )
  const leader = pick(leaderGear, input.overrides?.leader ?? input.gearRatio, (item) =>
    item.category === 'leader' ? item.strengthKg : 0,
  )
  const hook = pick(hooks, input.overrides?.hook ?? input.gearRatio, (item) =>
    item.category === 'hook' ? item.strengthKg : 0,
  )
  const offeringCandidates = lures.filter(
    (lure) => lure.weightG >= rod.minLureWeightG && lure.weightG <= rod.maxLureWeightG,
  )
  const offering = pick(
    offeringCandidates.length === 0 ? lures : offeringCandidates,
    input.overrides?.offering ?? input.gearRatio,
    (item) => (item.category === 'lure' ? item.weightG : 0),
  )

  return {
    rodId: rod.id,
    reelId: reel.id,
    lineId: line.id,
    leaderId: leader.id,
    hookId: hook.id,
    offeringId: offering.id,
    methodId: 'lure',
  }
}

export const simulateBigGame = (): BigGameResult => {
  const content = loadFixtureContent()
  const lines: string[] = []
  const skill = resolveFishingModifiers({
    skills: createInitialProgression().skills,
    perks: [],
  })

  const makeSetup = (label: string, loadout: Loadout): Setup => {
    const castingGear = resolveGearForLoadout(loadout, content.gear)

    if (castingGear === null) {
      throw new Error(`could not resolve gear for setup ${label}`)
    }

    return { label, loadout, capability: resolveFightCapability(castingGear) }
  }

  const buildSetup = (
    label: string,
    rodPower: RodDefinition['power'],
    gearRatio: number,
  ): Setup => {
    return makeSetup(label, buildTackleLoadout({ content, rodPower, gearRatio }))
  }

  const setups: readonly Setup[] = [
    buildSetup('Light', 'L', 0.15),
    buildSetup('Balanced', 'MH', 0.5),
    buildSetup('Heavy', 'XH', 0.95),
    /*
     * 最大級コンポーネント（gearRatio 1）の構成。「モンスター」という
     * 線形な上位 tier ではなく、最大ドラグ・最強ラインを選んだ結果の
     * 構成なので「Max Power」と呼ぶ。容量の小さい高出力リールを選ぶと
     * Heavy より spool に弱くなりうる — それがトレードオフの診断対象。
     */
    buildSetup('Max Power', 'XH', 1),
    {
      // Phase 18: 太いライン（切れにくい）を小容量リールに巻くと
      // ラインを出し尽くす SPOOLED になりやすい構成。
      ...makeSetup(
        'Spool',
        buildTackleLoadout({
          content,
          rodPower: 'XH',
          gearRatio: 0.5,
          reelSort: 'capacity',
          overrides: { reel: 0, line: 1, leader: 0.6, hook: 0.9 },
        }),
      ),
    },
  ]

  lines.push('Big Game simulation（Light / Balanced / Heavy / Max Power / Spool）')
  lines.push('', '=== Setup capability（実 Content の FightCapability） ===')
  for (const setup of setups) {
    const cap = setup.capability
    lines.push(
      `${setup.label.padEnd(9)} ` +
        `cap=${cap.effectiveLineCapacityM === null ? '?' : String(cap.effectiveLineCapacityM)}m ` +
        `reserve=${String(cap.reserveLineM)}m drag=${String(cap.dragCapacityKg)}kg ` +
        `weak=${cap.weakLink}(${String(cap.weakLinkStrengthKg)}kg) ` +
        `retrieve=${cap.retrievePower.toFixed(2)} rod=${cap.rodControl.toFixed(2)}`,
    )
  }

  const runSpecies = (speciesId: string): Readonly<Record<string, Stats>> => {
    const species = content.speciesById[speciesId]

    if (species === undefined) {
      throw new Error(`missing species: ${speciesId}`)
    }

    const result: Record<string, Stats> = {}

    for (const setup of setups) {
      const tackle = resolveTackle({
        loadout: setup.loadout,
        gear: content.gear,
        methods: content.methods,
        species,
      })
      if (tackle === null) {
        throw new Error(`could not resolve tackle for ${setup.label}`)
      }

      /*
       * Phase 18: 実 Content の FightCapability をエンジンに渡す。
       * 容量 / weak link / tensionMarginMultiplier / retrievePower /
       * rodControl / PUMP 効果 / 自然な SPOOLED リスクがファイトに効く。
       */
      const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)
      const records: FightRecord[] = []

      for (let index = 0; index < ATTEMPTS; index += 1) {
        const engine = new FishingEngine({
          // Spot の basePresence 相当（1.0 にすると必ずアタルため、現実的な値にする）。
          encounters: [{ species, presence: 0.5 }],
          seed: `${speciesId}#${setup.label}#${String(index)}`,
          playerModifiers: modifiers,
          // バイト（Encounter）も装備の影響を受ける（ラインの太さ・offering の相性）。
          encounterProfile: tackle.encounterProfile,
          fightCapability: setup.capability,
        })
        runFishingToTerminal(engine, 'balanced')

        const snapshot = engine.snapshot()
        const individual = snapshot.fish?.individual
        const outcome: Outcome =
          snapshot.phase === 'LINE_BREAK'
            ? 'line_break'
            : snapshot.phase === 'SPOOLED'
              ? 'spooled'
              : snapshot.phase === 'LANDED'
                ? 'landed'
                : snapshot.phase === 'HOOK_ESCAPE'
                  ? 'hook_escape'
                  : snapshot.phase === 'HOOK_MISSED'
                    ? 'hook_missed'
                    : 'no_bite'

        records.push({
          outcome,
          ticks: snapshot.totalTicks,
          battleSteps: snapshot.battle?.step ?? 0,
          lengthCm: individual?.lengthCm ?? 0,
        })
      }

      /*
       * バトル計測の分離:
       * - bites: Bite があった回数（アワセ失敗 = hook_missed を含む）
       * - fights: 実際に Text Battle に入った回数（battleSteps > 0 が
       *   FIGHTING に入った建築上の証拠。hook_missed は 0 step なので
       *   ここには入らない）
       * バトル長の統計は fights だけで取る（0 step の hook_missed で
       * 平均・p50/p90 が下方に汚染されないようにする）。
       */
      const bites = records.filter((record) => record.outcome !== 'no_bite').length
      const landed = records.filter((record) => record.outcome === 'landed').length
      const lineBreak = records.filter((record) => record.outcome === 'line_break').length
      const spooled = records.filter((record) => record.outcome === 'spooled').length
      const hookEscape = records.filter((record) => record.outcome === 'hook_escape').length
      const hookMissed = records.filter((record) => record.outcome === 'hook_missed').length
      const noBite = records.filter((record) => record.outcome === 'no_bite').length
      const landedRecords = records.filter((record) => record.outcome === 'landed')
      const fightSteps = records
        .filter((record) => record.battleSteps > 0)
        .map((record) => record.battleSteps)
        .sort((left, right) => left - right)
      const fights = fightSteps.length

      result[setup.label] = {
        label: setup.label,
        bites,
        fights,
        landed,
        lineBreak,
        spooled,
        hookEscape,
        hookMissed,
        noBite,
        avgTicks:
          records.length === 0
            ? 0
            : Math.round(records.reduce((sum, record) => sum + record.ticks, 0) / records.length),
        avgBattleSteps:
          fightSteps.length === 0
            ? 0
            : Math.round(
                (fightSteps.reduce((sum, step) => sum + step, 0) / fightSteps.length) * 10,
              ) / 10,
        p50BattleSteps: percentileOf(fightSteps, 0.5),
        p90BattleSteps: percentileOf(fightSteps, 0.9),
        p95BattleSteps: percentileOf(fightSteps, 0.95),
        avgLengthCm:
          landedRecords.length === 0
            ? 0
            : Math.round(
                (landedRecords.reduce((sum, record) => sum + record.lengthCm, 0) /
                  landedRecords.length) *
                  10,
              ) / 10,
        landedRateOfFights: fights === 0 ? 0 : Math.round((landed / fights) * 1000) / 1000,
        landedPerCast: Math.round((landed / ATTEMPTS) * 1000) / 1000,
      }
    }

    return result
  }

  const SETUP_LABELS = ['Light', 'Balanced', 'Heavy', 'Max Power', 'Spool'] as const

  const chinook = runSpecies('chinook-salmon')
  const halibut = runSpecies('pacific-halibut')
  const trevally = runSpecies('giant-trevally')
  const arapaima = runSpecies('arapaima')
  const small = runSpecies(SAMPLE_SPECIES.small)

  const report = (title: string, stats: Readonly<Record<string, Stats>>): void => {
    lines.push('', `=== ${title} ===`)
    lines.push(
      'setup      bites  fights  landed  lineBreak  spooled  escape  missed  noBite  land%(fight)  land/cast  avgStep  p50  p90  p95  avgLen',
    )

    for (const setup of SETUP_LABELS) {
      const entry = stats[setup]

      if (entry === undefined) {
        continue
      }

      lines.push(
        `${setup.padEnd(9)} ${String(entry.bites).padStart(6)} ${String(entry.fights).padStart(7)} ` +
          `${String(entry.landed).padStart(7)} ${String(entry.lineBreak).padStart(10)} ` +
          `${String(entry.spooled).padStart(8)} ${String(entry.hookEscape).padStart(7)} ` +
          `${String(entry.hookMissed).padStart(7)} ${String(entry.noBite).padStart(7)} ` +
          `${(entry.landedRateOfFights * 100).toFixed(1).padStart(12)}% ` +
          `${(entry.landedPerCast * 100).toFixed(1).padStart(9)}% ` +
          `${entry.avgBattleSteps.toFixed(1).padStart(8)} ` +
          `${String(entry.p50BattleSteps).padStart(4)} ${String(entry.p90BattleSteps).padStart(4)} ` +
          `${String(entry.p95BattleSteps).padStart(4)} ${String(entry.avgLengthCm).padStart(7)}`,
      )
    }
  }

  report(`Chinook Salmon（${String(ATTEMPTS)} fights / setup）`, chinook)
  report(`Pacific Halibut（${String(ATTEMPTS)} fights / setup）`, halibut)
  report(`Giant Trevally（${String(ATTEMPTS)} fights / setup）`, trevally)
  report(`Arapaima / extreme（${String(ATTEMPTS)} fights / setup）`, arapaima)
  report(`Small fish（${String(ATTEMPTS)} fights / setup）`, small)

  /*
   * Phase 18: 容量制約のスプールシナリオ。
   * 実在する最小容量リール（約 150m）では強タックルのファイトが先に終わるため、
   * 物理ライン管理の終端（SPOOLED）は「小容量の FightCapability を与えた
   * 強タックル」で検証する。強いライン/リーダー/フックのまま
   * 容量だけを絞るので、LINE_BREAK ではなく SPOOLED で終わるはず。
   */
  const SPOOL_ATTEMPTS = 40
  const SPOOL_CAPACITY_M = 45

  const runSpoolScenario = (
    speciesId: string,
  ): { readonly spooled: number; readonly other: number } => {
    const species = content.speciesById[speciesId]

    if (species === undefined) {
      throw new Error(`missing species: ${speciesId}`)
    }

    const loadout = buildTackleLoadout({ content, rodPower: 'XH', gearRatio: 1 })
    const castingGear = resolveGearForLoadout(loadout, content.gear)
    const tackle = resolveTackle({ loadout, gear: content.gear, methods: content.methods, species })

    if (castingGear === null || tackle === null) {
      throw new Error(`could not resolve spool-scenario tackle for ${speciesId}`)
    }

    const capability = {
      ...resolveFightCapability(castingGear),
      effectiveLineCapacityM: SPOOL_CAPACITY_M,
      reserveLineM: 10,
    }
    const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)

    let spooled = 0
    let other = 0

    for (let index = 0; index < SPOOL_ATTEMPTS; index += 1) {
      const engine = new FishingEngine({
        encounters: [{ species, presence: 1 }],
        seed: `spool#${speciesId}#${String(index)}`,
        playerModifiers: modifiers,
        encounterProfile: tackle.encounterProfile,
        fightCapability: capability,
      })
      runFishingToTerminal(engine, 'balanced')

      if (engine.snapshot().phase === 'SPOOLED') {
        spooled += 1
      } else {
        other += 1
      }
    }

    return { spooled, other }
  }

  const spoolHalibut = runSpoolScenario('pacific-halibut')
  const spoolArapaima = runSpoolScenario('arapaima')

  lines.push(
    '',
    `=== Spool scenario（容量 ${String(SPOOL_CAPACITY_M)}m / ${String(SPOOL_ATTEMPTS)} fights each） ===`,
  )
  lines.push(
    `  halibut : spooled=${String(spoolHalibut.spooled)} other=${String(spoolHalibut.other)}`,
  )
  lines.push(
    `  arapaima: spooled=${String(spoolArapaima.spooled)} other=${String(spoolArapaima.other)}`,
  )

  /*
   * Phase 17 → 18 統合: 実 Spot の Zone 解決 → キャスト / 深度デプロイ →
   * initialFightDistanceM / initialLineOutM → 実 FightCapability → FishingEngine。
   * useFishingSession と同じ変換を使う:
   * - キャスト: lineOut = 実着水距離 / fightDistance = 実着水距離
   * - 垂直デプロイ: lineOut = 実水深 × 1.15（scope）/ fightDistance = depthToFightDistanceM
   * 「どこに届いたか」の物理量がそのままファイト初期状態になることを確認する。
   */
  const runDeploymentIntegration = (input: {
    readonly spotId: string
    readonly targetZoneId: string
    readonly setupLabel: string
    readonly mode: 'cast' | 'depth'
    readonly fightCount: number
  }): {
    readonly reachable: boolean
    readonly deployedM: number
    readonly initialLineOutM: number
    readonly initialFightDistanceM: number
    readonly fights: number
    readonly landed: number
    readonly spooled: number
  } => {
    const spot = content.spots.find((entry) => entry.id === input.spotId)
    const setup = setups.find((entry) => entry.label === input.setupLabel)
    const castingGear =
      setup === undefined ? null : resolveGearForLoadout(setup.loadout, content.gear)

    if (spot === undefined || setup === undefined || castingGear === null) {
      throw new Error(`missing integration fixture: ${input.spotId}`)
    }

    const zones = fishingZonesForSpot(spot)
    const rng = new SeededRandomSource(`integration#${input.spotId}#${input.targetZoneId}`)
    let deployedM: number
    let reachable: boolean
    let initialFightDistanceM: number
    let initialLineOutM: number

    if (input.mode === 'cast') {
      const cast = resolveCast({
        zones,
        targetZoneId: input.targetZoneId,
        capability: resolveCastCapability({
          rod: castingGear.rod,
          reel: castingGear.reel,
          line: castingGear.line,
          offering: castingGear.offering,
          methodCastDistance:
            DEFAULT_GEAR_TUNING.methods[setup.loadout.methodId]?.castDistance ?? 0.5,
          skillCastingMultiplier: skill.castingPrecisionMultiplier,
          windy: false,
        }),
        random: rng,
      })
      reachable = cast.reachable
      deployedM = cast.reachable ? (cast.actualDistanceM ?? 0) : 0
      initialFightDistanceM = deployedM
      initialLineOutM = deployedM
    } else {
      const transport =
        content.transports.find((entry) => entry.boatCapability === 'offshore') ?? null
      const platform = resolveFishingPlatform(transport)
      const deployment = resolveDeployment({
        zones,
        targetZoneId: input.targetZoneId,
        capability: resolveDepthCapability({
          reel: castingGear.reel,
          line: castingGear.line,
          offering: castingGear.offering,
          platform: platform.platform,
          skillControlMultiplier: skill.castingPrecisionMultiplier,
        }),
        random: rng,
        drift: resolveDriftStrength(spot.current),
      })
      reachable = deployment.reachable
      deployedM = deployment.reachable ? (deployment.actualDepthM ?? 0) : 0
      initialFightDistanceM = depthToFightDistanceM(deployedM)
      initialLineOutM = Math.round(deployedM * 1.15)
    }

    const tackle = resolveTackle({
      loadout: setup.loadout,
      gear: content.gear,
      methods: content.methods,
    })

    if (tackle === null) {
      throw new Error(`could not resolve tackle for integration ${input.spotId}`)
    }

    const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)
    const encounters = spot.fishTable.flatMap((occurrence) => {
      const found = content.speciesById[String(occurrence.speciesId)]
      return found === undefined ? [] : [{ species: found, presence: occurrence.basePresence }]
    })

    let fights = 0
    let landed = 0
    let spooled = 0

    for (let index = 0; index < input.fightCount; index += 1) {
      const engine = new FishingEngine({
        encounters,
        seed: `integration#${input.spotId}#${String(index)}`,
        playerModifiers: modifiers,
        encounterProfile: tackle.encounterProfile,
        fightCapability: setup.capability,
        initialFightDistanceM,
        initialLineOutM,
      })
      runFishingToTerminal(engine, 'balanced')

      const snapshot = engine.snapshot()
      if ((snapshot.battle?.step ?? 0) > 0) {
        fights += 1
      }
      if (snapshot.phase === 'LANDED') {
        landed += 1
      }
      if (snapshot.phase === 'SPOOLED') {
        spooled += 1
      }
    }

    return {
      reachable,
      deployedM,
      initialLineOutM,
      initialFightDistanceM,
      fights,
      landed,
      spooled,
    }
  }

  const shallowCastCase = runDeploymentIntegration({
    spotId: 'arakawa-lower',
    targetZoneId: 'far-channel',
    setupLabel: 'Balanced',
    mode: 'cast',
    fightCount: 30,
  })
  const deepDeployCase = runDeploymentIntegration({
    spotId: 'norway-hidden-abyss-edge',
    targetZoneId: 'abyss',
    setupLabel: 'Heavy',
    mode: 'depth',
    fightCount: 30,
  })

  lines.push('', '=== Phase 17 → 18 統合（実 Spot のデプロイ → line-out → FightCapability） ===')
  lines.push(
    `  arakawa-lower / cast      : deployed=${String(shallowCastCase.deployedM)}m ` +
      `lineOut=${String(shallowCastCase.initialLineOutM)}m ` +
      `fights=${String(shallowCastCase.fights)} landed=${String(shallowCastCase.landed)} ` +
      `spooled=${String(shallowCastCase.spooled)}`,
  )
  lines.push(
    `  abyss-edge / depth        : depth=${String(deepDeployCase.deployedM)}m ` +
      `lineOut=${String(deepDeployCase.initialLineOutM)}m ` +
      `fightDist=${String(deepDeployCase.initialFightDistanceM)}m ` +
      `fights=${String(deepDeployCase.fights)} landed=${String(deepDeployCase.landed)} ` +
      `spooled=${String(deepDeployCase.spooled)}`,
  )

  const lightC = chinook['Light'] as Stats
  const balancedC = chinook['Balanced'] as Stats
  const heavyC = chinook['Heavy'] as Stats
  const lightH = halibut['Light'] as Stats
  const balancedH = halibut['Balanced'] as Stats
  const heavyH = halibut['Heavy'] as Stats
  const lightT = trevally['Light'] as Stats
  const maxPowerT = trevally['Max Power'] as Stats
  const lightA = arapaima['Light'] as Stats
  const heavyA = arapaima['Heavy'] as Stats
  const maxPowerA = arapaima['Max Power'] as Stats
  const lightS = small['Light'] as Stats
  const heavyS = small['Heavy'] as Stats

  /*
   * 実 Content の容量が効いているか: 人工的な容量絞り込みではなく、
   * 通常セットアップ（Light〜Max Power）で自然に発生した SPOOLED を報告する。
   * 'Spool' セットアップ（最小容量リール）は実 Content だが意図的に
   * 容量を絞った構成なので、別集計にする。
   */
  const STANDARD_SETUP_LABELS = ['Light', 'Balanced', 'Heavy', 'Max Power'] as const
  const allStats = [chinook, halibut, trevally, arapaima, small]
  const countSpooled = (labels: readonly string[]): number =>
    allStats.reduce(
      (sum, stats) =>
        sum + labels.reduce((inner, setup) => inner + (stats[setup]?.spooled ?? 0), 0),
      0,
    )
  const naturalSpooled = countSpooled(STANDARD_SETUP_LABELS)
  const spoolSetupSpooled = countSpooled(['Spool'])
  lines.push(
    '',
    `実 Content の自然な SPOOLED（標準セットアップ合計）: ${String(naturalSpooled)} / 最小容量セットアップ: ${String(spoolSetupSpooled)}`,
  )

  const checks: BigGameCheck[] = [
    {
      label: 'Chinook: Heavy は Light より明確に着地率が高い（+15pt 以上）',
      ok: heavyC.landedRateOfFights >= lightC.landedRateOfFights + 0.15,
    },
    {
      label: 'Chinook: Light は Heavy よりラインブレイクが多い',
      ok: lightC.lineBreak > heavyC.lineBreak,
    },
    {
      label: 'Chinook: Balanced は Light と Heavy の間にある',
      ok:
        balancedC.landedRateOfFights >= lightC.landedRateOfFights &&
        balancedC.landedRateOfFights <= heavyC.landedRateOfFights + 0.05,
    },
    {
      label: 'Halibut: Heavy は Light より明確に着地率が高い',
      ok: heavyH.landedRateOfFights >= lightH.landedRateOfFights + 0.15,
    },
    {
      label: 'Halibut: Light は Heavy よりラインブレイクが多い',
      ok: lightH.lineBreak > heavyH.lineBreak,
    },
    {
      label: 'Halibut: Balanced は Light と Heavy の間にある',
      ok:
        balancedH.landedRateOfFights >= lightH.landedRateOfFights &&
        balancedH.landedRateOfFights <= heavyH.landedRateOfFights + 0.05,
    },
    {
      label: 'Giant Trevally: Max Power は Light より着地率が高い',
      ok: maxPowerT.landedRateOfFights >= lightT.landedRateOfFights + 0.1,
    },
    {
      label: 'Extreme（Arapaima）: Max Power でも 100% にはならない',
      ok: maxPowerA.landed < ATTEMPTS,
    },
    {
      label: 'Extreme（Arapaima）: Light は Max Power より失敗が多い',
      ok: lightA.landedRateOfFights <= maxPowerA.landedRateOfFights,
    },
    {
      label: 'SPOOLED は独立した負け筋として発生する（容量制約シナリオ）',
      ok: spoolHalibut.spooled + spoolArapaima.spooled > 0,
    },
    {
      label: '実 Spot のキャスト → line-out → ファイトが繋がる（shallow cast）',
      ok: shallowCastCase.reachable && shallowCastCase.fights > 0,
    },
    {
      label: '実 Spot の深度デプロイ → line-out > fight距離 → ファイトが繋がる（deep）',
      ok:
        deepDeployCase.reachable &&
        deepDeployCase.initialLineOutM > deepDeployCase.initialFightDistanceM &&
        deepDeployCase.fights > 0,
    },
    {
      label: '小型魚: Heavy は万能ではない（Light の land/cast 以上にはならない）',
      ok: heavyS.landedPerCast <= lightS.landedPerCast,
    },
    {
      label: '0% / 100% に張り付かない（Light でも大型を獲れる余地がある）',
      ok: lightC.landed > 0 && heavyC.landed < ATTEMPTS,
    },
    /*
     * ペーシング（プレイヤー決定数）。帯ごとの目安:
     *   小型 ~数回 / 大型 ~8〜18 / Big Game ~15〜35 / 極端な個体は稀に超過。
     * 「常に 60〜100 連打」を許す上限にはしない。
     */
    {
      label: '小型魚のバトルは短い（avg <= 10 / p90 <= 10 決定）',
      ok: lightS.avgBattleSteps <= 10 && lightS.p90BattleSteps <= 10,
    },
    {
      label: '大型魚は小型より長いが実用的（Chinook/GT Heavy avg 8〜30 決定）',
      ok:
        heavyC.avgBattleSteps >= 8 &&
        heavyC.avgBattleSteps <= 30 &&
        (trevally['Heavy'] as Stats).avgBattleSteps >= 8 &&
        (trevally['Heavy'] as Stats).avgBattleSteps <= 30,
    },
    {
      label: 'Big Game は通常魚より明確に長い（Heavy avg >= 15 決定）',
      ok: heavyH.avgBattleSteps >= 15 && heavyA.avgBattleSteps >= 15,
    },
    {
      label: 'Big Game の代表ファイトはモバイルで実用的（Heavy p90 <= 60 決定）',
      ok: heavyH.p90BattleSteps <= 60 && heavyA.p90BattleSteps <= 60,
    },
    {
      label: '極端な個体の長いファイトは残るが無限ではない（p95 <= 150 決定）',
      ok: heavyA.p95BattleSteps <= 150 && maxPowerA.p95BattleSteps <= 150,
    },
    {
      label: 'HOOK_MISSED をバトル統計に含めない（fights <= bites・miss 分だけ少ない）',
      ok:
        halibut['Heavy'] !== undefined &&
        (halibut['Heavy'] as Stats).fights <= (halibut['Heavy'] as Stats).bites &&
        (halibut['Heavy'] as Stats).bites - (halibut['Heavy'] as Stats).fights <=
          (halibut['Heavy'] as Stats).hookMissed,
    },
    {
      label: '実 Content のライン容量が意味を持つ（自然な SPOOLED が発生する）',
      ok: naturalSpooled > 0,
    },
  ]

  const again = runSpecies('chinook-salmon')
  const fingerprint = JSON.stringify(chinook)
  const deterministic = fingerprint === JSON.stringify(again)

  checks.push({
    label: '同じ入力から同じ結果（決定論的）',
    ok: deterministic,
  })

  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push(
    '',
    allOk ? 'OK: big game balance is healthy' : 'FAILED: big game balance has problems',
  )

  return { exitCode: allOk ? 0 : 1, lines, checks, fingerprint }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateBigGame()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
