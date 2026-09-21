import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import type { BuiltInContent } from '../src/content/catalog/assembleContent'
import { DEFAULT_FISHING_TUNING } from '../src/domain/fishing/FishingTuning'
import { FishingEngine, isTerminalPhase, type FishingSnapshot } from '../src/domain/fishing'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import { asGearId } from '../src/domain/ids'
import {
  COMPATIBILITY_LABELS,
  resolveTackle,
  type Loadout,
  type ResolvedFishingSetup,
} from '../src/domain/tackle'
import {
  biteChance,
  speciesAffinity,
  type EncounterCandidate,
  type EncounterProfile,
} from '../src/domain/encounter/encounterEngine'
import { chooseCommand } from './simulate-fishing'

/**
 * Tackle（装備）でプレイ感が変わることを、決定論的に確認する。
 *
 *   Starter / Finesse / Balanced / Power
 *
 * 同じ Spot・同じ seed・同じ操作 policy で釣りを流し、
 * 「どの装備が、何に向いているか」を数値で出す。
 * **Power が全条件で最強になっていないこと**をチェックする。
 */

export type BuildId = 'starter' | 'finesse' | 'balanced' | 'power'

export type TackleBuild = {
  readonly id: BuildId
  readonly label: string
  readonly description: string
  readonly loadout: Loadout
}

export const tackleBuilds = (): readonly TackleBuild[] => [
  {
    id: 'starter',
    label: 'Starter',
    description: '初期装備。何でも少しできる。',
    loadout: {
      rodId: asGearId('starter-rod'),
      reelId: asGearId('starter-reel'),
      lineId: asGearId('starter-nylon-line'),
      leaderId: asGearId('starter-leader'),
      hookId: asGearId('starter-hook'),
      offeringId: asGearId('starter-lure'),
      methodId: 'lure',
    },
  },
  {
    id: 'finesse',
    label: 'Finesse',
    description: '軽量ルアー・細いライン・高感度。小〜中型向け。',
    loadout: {
      rodId: asGearId('rod-finesse'),
      reelId: asGearId('reel-light'),
      lineId: asGearId('line-pe-light'),
      leaderId: null,
      hookId: asGearId('hook-small'),
      offeringId: asGearId('lure-minnow-light'),
      methodId: 'light_lure',
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: '汎用ロッド + フロロ + バイブレーション。広く対応する。',
    loadout: {
      rodId: asGearId('rod-balanced'),
      reelId: asGearId('reel-light'),
      lineId: asGearId('line-fluoro'),
      leaderId: asGearId('starter-leader'),
      hookId: asGearId('starter-hook'),
      offeringId: asGearId('lure-vibration-mid'),
      methodId: 'lure',
    },
  },
  {
    id: 'power',
    label: 'Power',
    description: '強いロッド・太いライン・大ドラッグ。大型向け。',
    loadout: {
      rodId: asGearId('rod-power'),
      reelId: asGearId('reel-power'),
      lineId: asGearId('line-nylon-heavy'),
      leaderId: asGearId('leader-fluoro-heavy'),
      hookId: asGearId('hook-large'),
      offeringId: asGearId('lure-jig-big'),
      methodId: 'lure',
    },
  },
]

export type FightOutcomeCounts = {
  readonly samples: number
  readonly landed: number
  readonly hookMissed: number
  readonly hookEscape: number
  readonly lineBreak: number
  readonly noBite: number
  readonly totalTicks: number
}

/**
 * 操作の方針。
 *
 * - `balanced`: simulate:fishing と同じ。テンションが 8 割を超えたら GIVE する。
 * - `aggressive`: 9.3 割まで攻める。ドラッグ性能の差が出る（弱い装備は切れる）。
 */
export type TacklePolicy = 'balanced' | 'aggressive'

const AGGRESSIVE_TENSION_LIMIT = 0.93

const chooseTackleCommand = (policy: TacklePolicy, snapshot: FishingSnapshot) => {
  if (policy === 'balanced') {
    return chooseCommand('balanced', snapshot)
  }

  if (snapshot.phase === 'IDLE') {
    return 'cast' as const
  }

  if (snapshot.phase === 'HOOK_WINDOW') {
    return 'hook' as const
  }

  if (snapshot.phase === 'FIGHTING') {
    const ratio = snapshot.tension / snapshot.maxTension
    return ratio > AGGRESSIVE_TENSION_LIMIT ? ('give' as const) : ('reel' as const)
  }

  return 'cast' as const
}

/** 1 回の釣りを最後まで進める。 */
const runFight = (
  engine: FishingEngine,
  maxSteps: number,
  policy: TacklePolicy,
): FishingSnapshot => {
  let steps = 0

  while (!isTerminalPhase(engine.snapshot().phase) && steps < maxSteps) {
    const snapshot = engine.snapshot()
    const outcome = engine.dispatch(chooseTackleCommand(policy, snapshot))
    engine.tick()

    if (outcome.accepted) {
      steps += 1
    }
  }

  return engine.snapshot()
}

/** seed を固定しているので、同じ入力なら何度流しても同じ結果になる。 */
export const simulateFights = (options: {
  readonly setup: ResolvedFishingSetup
  readonly encounters: readonly EncounterCandidate[]
  readonly seeds: readonly (number | string)[]
  readonly maxSteps?: number
  readonly policy?: TacklePolicy
}): FightOutcomeCounts => {
  const maxSteps = options.maxSteps ?? 4000
  const policy = options.policy ?? 'balanced'
  const tally = {
    samples: options.seeds.length,
    landed: 0,
    hookMissed: 0,
    hookEscape: 0,
    lineBreak: 0,
    noBite: 0,
    totalTicks: 0,
  }

  for (const seed of options.seeds) {
    const engine = new FishingEngine({
      encounters: options.encounters,
      seed,
      playerModifiers: options.setup.playerModifiers,
      encounterProfile: {
        methodId: options.setup.encounterProfile.methodId,
        offeringTags: options.setup.encounterProfile.offeringTags,
        biteAffinity: options.setup.encounterProfile.biteAffinity,
      },
    })

    const final = runFight(engine, maxSteps, policy)
    tally.totalTicks += final.totalTicks

    switch (final.phase) {
      case 'LANDED':
        tally.landed += 1
        break
      case 'HOOK_MISSED':
        tally.hookMissed += 1
        break
      case 'HOOK_ESCAPE':
        tally.hookEscape += 1
        break
      case 'LINE_BREAK':
        tally.lineBreak += 1
        break
      default:
        tally.noBite += 1
        break
    }
  }

  return tally
}

export type TackleSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly { readonly label: string; readonly ok: boolean }[]
}

const SEED_COUNT = 120
const seeds = (): readonly number[] => Array.from({ length: SEED_COUNT }, (_, index) => index + 1)

const percent = (value: number, total: number): string =>
  total === 0 ? '-' : `${String(Math.round((value / total) * 100))}%`

const speciesOf = (content: BuiltInContent, id: string): FishSpecies => {
  const species = content.speciesById[id]

  if (species === undefined) {
    throw new Error(`unknown species: ${id}`)
  }

  return species
}

const asEncounterProfile = (setup: ResolvedFishingSetup): EncounterProfile => ({
  methodId: setup.encounterProfile.methodId,
  offeringTags: setup.encounterProfile.offeringTags,
  biteAffinity: setup.encounterProfile.biteAffinity,
})

export const buildSummary = (setup: ResolvedFishingSetup): string =>
  [
    setup.method.name,
    `適合 ${COMPATIBILITY_LABELS[setup.compatibility.level]}(${setup.compatibility.score.toFixed(2)})`,
    `パワー ${setup.ratings.power.toFixed(2)}`,
    `繊細 ${setup.ratings.finesse.toFixed(2)}`,
    `飛距離 ${setup.ratings.distance.toFixed(2)}`,
    `耐テンション x${setup.playerModifiers.maxTensionMultiplier.toFixed(2)}`,
    `REEL x${setup.playerModifiers.reelEfficiencyMultiplier.toFixed(2)}`,
  ].join(' | ')

export const scenarioCounts = (options: {
  readonly target: FishSpecies
  readonly setups: ReadonlyMap<BuildId, ResolvedFishingSetup>
  readonly seedList: readonly (number | string)[]
  readonly policy?: TacklePolicy
}): ReadonlyMap<BuildId, FightOutcomeCounts> => {
  const counts = new Map<BuildId, FightOutcomeCounts>()
  const encounters: readonly EncounterCandidate[] = [{ species: options.target, presence: 1 }]

  for (const [id, setup] of options.setups) {
    counts.set(
      id,
      simulateFights({
        setup,
        encounters,
        seeds: options.seedList,
        ...(options.policy === undefined ? {} : { policy: options.policy }),
      }),
    )
  }

  return counts
}

/**
 * 複数魚種がいる場所で、どの魚種を選びやすいか。
 * 乱数の消費順は固定なので、同じ seed 列なら何度でも同じ結果になる。
 */
export const simulateEncounterSelection = (options: {
  readonly setup: ResolvedFishingSetup
  readonly candidates: readonly EncounterCandidate[]
  readonly seedList: readonly (number | string)[]
}): ReadonlyMap<string, number> => {
  const selected = new Map<string, number>()

  for (const seed of options.seedList) {
    const engine = new FishingEngine({
      encounters: options.candidates,
      seed,
      playerModifiers: options.setup.playerModifiers,
      encounterProfile: {
        methodId: options.setup.encounterProfile.methodId,
        offeringTags: options.setup.encounterProfile.offeringTags,
        biteAffinity: options.setup.encounterProfile.biteAffinity,
      },
    })

    engine.cast()

    for (let tick = 0; tick < 120; tick += 1) {
      engine.tick()

      const snapshot = engine.snapshot()
      const fish = snapshot.fish

      if (fish !== null) {
        const id = String(fish.individual.speciesId)
        selected.set(id, (selected.get(id) ?? 0) + 1)
        break
      }

      if (isTerminalPhase(snapshot.phase)) {
        break
      }
    }
  }

  return selected
}

export const simulateTackle = (): TackleSimulationResult => {
  const content = loadContentFromDirectory()
  const builds = tackleBuilds()
  const lines: string[] = []
  const checks: { label: string; ok: boolean }[] = []
  const setups = new Map<BuildId, ResolvedFishingSetup>()

  lines.push('=== builds ===')

  for (const build of builds) {
    const setup = resolveTackle({
      loadout: build.loadout,
      gear: content.gear,
      methods: content.methods,
    })

    if (setup === null) {
      lines.push(`${build.label.padEnd(9)} : 解決できなかった（装備が揃っていない）`)
      continue
    }

    setups.set(build.id, setup)
    lines.push(`${build.label.padEnd(9)} : ${buildSummary(setup)}`)
    lines.push(`${' '.repeat(9)}   ${build.description}`)
  }

  checks.push({ label: 'すべての Build が解決できる', ok: setups.size === builds.length })
  checks.push({
    label: 'Starter が致命的な不整合ではない',
    ok: setups.get('starter')?.compatibility.fatal === false,
  })

  // --- 狙う魚による相性（Encounter 側） -------------------------------

  const lightTarget = speciesOf(content, 'phase2-sample-fish-f')
  const bigTarget = speciesOf(content, 'phase2-sample-fish-i')
  const affinityFor = (id: BuildId, species: FishSpecies): number => {
    const setup = setups.get(id)
    return setup === undefined ? 0 : speciesAffinity(species, asEncounterProfile(setup))
  }

  const affinityLine = (species: FishSpecies): string =>
    `${species.japaneseName.padEnd(14)} : ` +
    builds.map((build) => `${build.label} ${affinityFor(build.id, species).toFixed(2)}`).join(' / ')

  lines.push('')
  lines.push('=== 魚種ごとの相性（Encounter の重み） ===')
  lines.push(affinityLine(lightTarget))
  lines.push(affinityLine(bigTarget))

  const finesseLight = affinityFor('finesse', lightTarget)
  const powerLight = affinityFor('power', lightTarget)
  const finesseBig = affinityFor('finesse', bigTarget)
  const powerBig = affinityFor('power', bigTarget)

  checks.push({
    label: 'Finesse は小型狙いで Power より相性が良い',
    ok: finesseLight > powerLight,
  })
  checks.push({
    label: 'Power は大型狙いで Finesse より相性が良い',
    ok: powerBig > finesseBig,
  })
  checks.push({
    label: 'Power は小型狙いで Finesse に劣る（万能ではない）',
    ok: powerLight < finesseLight,
  })

  // --- 同じ Spot で offering を変えると値が変わる ----------------------

  const spot = content.spots.find((entry) => String(entry.id) === 'tokyo-bay-shore')

  if (spot !== undefined) {
    const candidates: readonly EncounterCandidate[] = spot.fishTable.flatMap((occurrence) => {
      const species = content.speciesById[String(occurrence.speciesId)]
      return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
    })
    const lureSetup = setups.get('balanced')
    const baitProfile: EncounterProfile = {
      methodId: 'bottom',
      offeringTags: ['cut'],
      biteAffinity: 1,
    }
    const lureChance =
      lureSetup === undefined
        ? 0
        : biteChance(candidates, DEFAULT_FISHING_TUNING, asEncounterProfile(lureSetup))
    const baitChance = biteChance(candidates, DEFAULT_FISHING_TUNING, baitProfile)

    lines.push('')
    lines.push(`=== 同じ Spot（${spot.name}）で offering を変える ===`)
    lines.push(`lure（バイブレーション） ヒット率 ${(lureChance * 100).toFixed(1)}%`)
    lines.push(`bait（bottom / cut）      ヒット率 ${(baitChance * 100).toFixed(1)}%`)

    checks.push({
      label: 'offering を変えると Encounter の値が変わる',
      ok: Math.abs(lureChance - baitChance) > 1e-6,
    })
  }

  // --- ファイト（同じ seed で装備だけ変える） --------------------------

  const lightCounts = scenarioCounts({ target: lightTarget, setups, seedList: seeds() })
  const bigCounts = scenarioCounts({
    target: bigTarget,
    setups,
    seedList: seeds(),
    policy: 'aggressive',
  })

  const fightLine = (build: TackleBuild, result: FightOutcomeCounts): string =>
    `${build.label.padEnd(9)} LANDED ${String(result.landed).padStart(3)}/${String(
      result.samples,
    )} (${percent(result.landed, result.samples)}) / LINE_BREAK ${String(result.lineBreak).padStart(
      3,
    )} / ESCAPE ${String(result.hookEscape).padStart(3)} / ticks平均 ${(
      result.totalTicks / Math.max(1, result.samples)
    ).toFixed(0)}`

  lines.push('')
  lines.push('=== ファイト: 小型（phase2-sample-fish-f / 普通の操作） ===')

  for (const build of builds) {
    const result = lightCounts.get(build.id)

    if (result === undefined) {
      continue
    }

    lines.push(fightLine(build, result))
  }

  lines.push('')
  lines.push('=== ファイト: 大型（phase2-sample-fish-i / 9.3 割まで攻める） ===')

  for (const build of builds) {
    const result = bigCounts.get(build.id)

    if (result === undefined) {
      continue
    }

    lines.push(fightLine(build, result))
  }

  const finesseLightCount = lightCounts.get('finesse')
  const finesseBigCount = bigCounts.get('finesse')
  const powerBigCount = bigCounts.get('power')
  const starterBigCount = bigCounts.get('starter')

  checks.push({
    label: '小型でも釣りが成立する（Finesse が 1 匹以上取り込む）',
    ok: (finesseLightCount?.landed ?? 0) > 0,
  })
  checks.push({
    label: '大型では Power のほうが取り込める（切られにくい）',
    ok:
      powerBigCount !== undefined &&
      finesseBigCount !== undefined &&
      powerBigCount.landed >= finesseBigCount.landed &&
      powerBigCount.lineBreak <= finesseBigCount.lineBreak,
  })
  checks.push({
    label: '装備なしでも釣りは成立する（Starter が 1 匹以上取り込む）',
    ok: (starterBigCount?.landed ?? 0) > 0,
  })

  // --- 小型と大型が混ざる場所での魚種選択 --------------------------------

  const mixed: readonly EncounterCandidate[] = [
    { species: lightTarget, presence: 1 },
    { species: bigTarget, presence: 1 },
  ]
  const finesseSetup = setups.get('finesse')
  const powerSetup = setups.get('power')
  const finesseMix =
    finesseSetup === undefined
      ? new Map<string, number>()
      : simulateEncounterSelection({ setup: finesseSetup, candidates: mixed, seedList: seeds() })
  const powerMix =
    powerSetup === undefined
      ? new Map<string, number>()
      : simulateEncounterSelection({ setup: powerSetup, candidates: mixed, seedList: seeds() })
  const lightId = String(lightTarget.id)

  lines.push('')
  lines.push('=== 小型と大型が混ざる場所で、どちらを掛けやすいか ===')
  lines.push(
    `Finesse : 小型 ${String(finesseMix.get(lightId) ?? 0)} / 大型 ${String(
      finesseMix.get(String(bigTarget.id)) ?? 0,
    )}`,
  )
  lines.push(
    `Power   : 小型 ${String(powerMix.get(lightId) ?? 0)} / 大型 ${String(
      powerMix.get(String(bigTarget.id)) ?? 0,
    )}`,
  )

  checks.push({
    label: 'Finesse は小型を掛けやすい（実測）',
    ok: (finesseMix.get(lightId) ?? 0) > (powerMix.get(lightId) ?? 0),
  })

  // --- 決定論 ----------------------------------------------------------

  const again = loadContentFromDirectory()
  const repeated = builds
    .map((build) => {
      const setup = resolveTackle({
        loadout: build.loadout,
        gear: again.gear,
        methods: again.methods,
      })
      return `${build.id}:${setup === null ? 'null' : buildSummary(setup)}`
    })
    .join('|')
  const current = builds
    .map((build) => {
      const setup = setups.get(build.id)
      return `${build.id}:${setup === undefined ? 'null' : buildSummary(setup)}`
    })
    .join('|')

  checks.push({ label: '同じ入力から同じ結果（決定論的）', ok: current === repeated })

  lines.push('')
  lines.push('--- checks ---')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('')
  lines.push(allOk ? 'OK: tackle depth is healthy' : 'FAILED: tackle depth has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateTackle()

    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
