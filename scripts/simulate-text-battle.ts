import { pathToFileURL } from 'node:url'
import { loadFixtureContent, SAMPLE_SPECIES } from '../tests/fixtures/content'
import type { BuiltInContent } from '../src/content/catalog/assembleContent'
import type { RodDefinition } from '../src/domain/gear/Gear'
import { FishingEngine, isTerminalPhase } from '../src/domain/fishing'
import { suggestBattleCommand, type BattleBehaviour } from '../src/domain/fishing/battle'
import type { FishingCommand, FishingSnapshot } from '../src/domain/fishing'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import type { Loadout } from '../src/domain/tackle'
import { createInitialProgression, resolveFishingModifiers } from '../src/domain/progression'
import { composeFishingModifiers, resolveTackle } from '../src/domain/tackle'
import { buildTackleLoadout } from './simulate-big-game'

/**
 * Text Fishing Battle のシミュレータ（Phase 10）。
 *
 *   小型 / 中型 / Chinook / Halibut
 * ×
 *   4 つの戦略（Always Reel / Always Power Reel / Always Give / Reactive）
 *
 * で釣りを流し、「魚の行動を読んで選ぶ方が、単一コマンド連打より強い」ことを確かめる。
 *
 * 決定論的（同じ seed・同じコマンド列なら同じ結果）。
 * ここは調整値の正しさではなく、**関係性**（Reactive > spam）を見る。
 */

export type StrategyId = 'reel' | 'power_reel' | 'give' | 'reactive'

export const STRATEGY_LABELS: Readonly<Record<StrategyId, string>> = {
  reel: 'Always Reel',
  power_reel: 'Always Power',
  give: 'Always Give',
  reactive: 'Reactive',
}

export const STRATEGY_ORDER: readonly StrategyId[] = ['reel', 'power_reel', 'give', 'reactive']

const ATTEMPTS = 60

type Scenario = {
  readonly id: string
  readonly label: string
  readonly speciesId: string
  readonly presence: number
  readonly rodPower: RodDefinition['power']
  readonly gearRatio: number
}

export const scenarios = (): readonly Scenario[] => [
  {
    id: 'small',
    label: 'Small fish',
    speciesId: SAMPLE_SPECIES.smallFresh,
    presence: 0.8,
    rodPower: 'L',
    gearRatio: 0.3,
  },
  {
    id: 'medium',
    label: 'Medium fish',
    speciesId: SAMPLE_SPECIES.bigSalt,
    presence: 0.7,
    rodPower: 'M',
    gearRatio: 0.5,
  },
  {
    id: 'chinook',
    label: 'Chinook',
    speciesId: 'alaska-chinook-salmon',
    presence: 0.6,
    rodPower: 'MH',
    gearRatio: 0.5,
  },
  {
    id: 'halibut',
    label: 'Halibut',
    speciesId: 'alaska-pacific-halibut',
    presence: 0.6,
    rodPower: 'MH',
    gearRatio: 0.5,
  },
]

const RUNNING: readonly BattleBehaviour[] = ['run', 'surge', 'second_run']

/**
 * Reactive 戦略（魚の行動を読んで選ぶ）。
 *
 * AUTO / テスト用の suggestBattleCommand より一歩踏み込み、ドラグも使う。
 * 「読んで選ぶ」方が「常に同じコマンド」より良い、という関係を作るための戦略である。
 */
export const reactiveCommand = (snapshot: FishingSnapshot): FishingCommand => {
  const battle = snapshot.battle

  if (battle === null) {
    return 'reel'
  }

  const ratio = snapshot.tension / snapshot.maxTension
  const behaviour = battle.behaviour

  if (snapshot.phase === 'LANDING') {
    const struggling = RUNNING.includes(behaviour) || behaviour === 'head_shake'

    if (struggling) {
      return 'wait'
    }

    return battle.hookHold > 0.3 && ratio < 0.85 ? 'land' : 'wait'
  }

  // 危険域: まずドラグを緩める（張りっぱなしを避ける）。
  if (ratio > 0.85) {
    return battle.drag > 0.35 ? 'loosen_drag' : 'give'
  }

  if (RUNNING.includes(behaviour)) {
    return ratio > 0.55 ? 'give' : 'hold'
  }

  switch (behaviour) {
    case 'head_shake':
      return ratio < 0.7 ? 'hold' : 'give'
    case 'dive':
      return ratio > 0.7 ? 'give' : 'reel'
    case 'come_toward':
      return 'reel'
    case 'rest':
      return 'power_reel'
    default:
      return ratio < 0.6 ? 'reel' : 'hold'
  }
}

const commandFor = (snapshot: FishingSnapshot, strategy: StrategyId): FishingCommand => {
  if (snapshot.phase === 'IDLE') {
    return 'cast'
  }

  if (snapshot.phase === 'HOOK_WINDOW') {
    return 'hook'
  }

  if (snapshot.phase === 'FIGHTING') {
    if (strategy === 'reel' || strategy === 'power_reel' || strategy === 'give') {
      return strategy
    }

    return reactiveCommand(snapshot)
  }

  if (snapshot.phase === 'LANDING') {
    if (strategy === 'give') {
      return 'wait'
    }

    if (strategy === 'reel' || strategy === 'power_reel') {
      return 'land'
    }

    return reactiveCommand(snapshot)
  }

  return suggestBattleCommand({
    phase: snapshot.phase,
    tension: snapshot.tension,
    maxTension: snapshot.maxTension,
    behaviour: snapshot.battle?.behaviour ?? null,
    hookHold: snapshot.battle?.hookHold ?? 0,
  })
}

export type BattleStats = {
  readonly strategy: StrategyId
  readonly samples: number
  readonly hooked: number
  readonly landed: number
  readonly lineBreak: number
  readonly hookEscape: number
  readonly hookMissed: number
  readonly noBite: number
  readonly landedRate: number
  readonly lineBreakRate: number
  readonly hookEscapeRate: number
  readonly avgCommands: number
  readonly avgMaxTensionRatio: number
  readonly avgDistanceM: number
  readonly avgEndingHookHold: number
}

const runFight = (input: {
  readonly species: FishSpecies
  readonly loadout: Loadout
  readonly content: BuiltInContent
  readonly strategy: StrategyId
  readonly seed: string
}): {
  readonly phase: string
  readonly commands: number
  readonly maxTensionRatio: number
  readonly distanceM: number
  readonly hookHold: number
} => {
  const tackle = resolveTackle({
    loadout: input.loadout,
    gear: input.content.gear,
    methods: input.content.methods,
    species: input.species,
  })
  const skill = resolveFishingModifiers({
    skills: createInitialProgression().skills,
    perks: [],
  })
  const modifiers = tackle === null ? skill : composeFishingModifiers(skill, tackle.playerModifiers)
  const engine = new FishingEngine({
    encounters: [{ species: input.species, presence: 0.6 }],
    seed: input.seed,
    playerModifiers: modifiers,
    ...(tackle === null ? {} : { encounterProfile: tackle.encounterProfile }),
  })

  let commands = 0
  let maxTensionRatio = 0
  let guard = 0

  while (!isTerminalPhase(engine.snapshot().phase) && guard < 4000) {
    const snapshot = engine.snapshot()
    maxTensionRatio = Math.max(maxTensionRatio, snapshot.tension / snapshot.maxTension)
    const command = commandFor(snapshot, input.strategy)
    const commandPhase =
      snapshot.phase === 'FIGHTING' ||
      snapshot.phase === 'LANDING' ||
      snapshot.phase === 'IDLE' ||
      snapshot.phase === 'HOOK_WINDOW'

    if (commandPhase) {
      engine.dispatch(command)

      if (snapshot.phase === 'FIGHTING') {
        commands += 1
      }
    } else {
      engine.tick()
    }

    guard += 1
  }

  const final = engine.snapshot()

  return {
    phase: final.phase,
    commands,
    maxTensionRatio,
    distanceM: final.battle?.distanceM ?? 0,
    hookHold: final.battle?.hookHold ?? 0,
  }
}

export const simulateStrategy = (input: {
  readonly content: BuiltInContent
  readonly scenario: Scenario
  readonly strategy: StrategyId
  readonly attempts?: number
}): BattleStats => {
  const attempts = input.attempts ?? ATTEMPTS
  const species = input.content.speciesById[input.scenario.speciesId]

  if (species === undefined) {
    throw new Error(`missing species: ${input.scenario.speciesId}`)
  }

  const loadout = buildTackleLoadout({
    content: input.content,
    rodPower: input.scenario.rodPower,
    gearRatio: input.scenario.gearRatio,
  })

  let landed = 0
  let lineBreak = 0
  let hookEscape = 0
  let hookMissed = 0
  let noBite = 0
  let commandSum = 0
  let tensionSum = 0
  let distanceSum = 0
  let hookHoldSum = 0

  for (let index = 0; index < attempts; index += 1) {
    const result = runFight({
      species,
      loadout,
      content: input.content,
      strategy: input.strategy,
      seed: `${input.scenario.id}#${input.strategy}#${String(index)}`,
    })

    switch (result.phase) {
      case 'LANDED':
        landed += 1
        break
      case 'LINE_BREAK':
        lineBreak += 1
        break
      case 'HOOK_ESCAPE':
        hookEscape += 1
        break
      case 'HOOK_MISSED':
        hookMissed += 1
        break
      default:
        noBite += 1
        break
    }

    commandSum += result.commands
    tensionSum += result.maxTensionRatio
    distanceSum += result.distanceM
    hookHoldSum += result.hookHold
  }

  const hooked = attempts - noBite

  return {
    strategy: input.strategy,
    samples: attempts,
    hooked,
    landed,
    lineBreak,
    hookEscape,
    hookMissed,
    noBite,
    landedRate: attempts === 0 ? 0 : landed / attempts,
    lineBreakRate: attempts === 0 ? 0 : lineBreak / attempts,
    hookEscapeRate: attempts === 0 ? 0 : hookEscape / attempts,
    avgCommands: commandSum / Math.max(1, attempts),
    avgMaxTensionRatio: tensionSum / Math.max(1, attempts),
    avgDistanceM: distanceSum / Math.max(1, attempts),
    avgEndingHookHold: hookHoldSum / Math.max(1, attempts),
  }
}

export type TextBattleCheck = {
  readonly label: string
  readonly ok: boolean
}

export type TextBattleResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly TextBattleCheck[]
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`

export const simulateTextBattle = (): TextBattleResult => {
  const content = loadFixtureContent()
  const lines: string[] = ['Text Fishing Battle simulation（decision-driven, not button-spam）']
  const checks: TextBattleCheck[] = []
  const statsByScenario = new Map<string, Map<StrategyId, BattleStats>>()

  for (const scenario of scenarios()) {
    const stats = new Map<StrategyId, BattleStats>()

    for (const strategy of STRATEGY_ORDER) {
      stats.set(strategy, simulateStrategy({ content, scenario, strategy }))
    }

    statsByScenario.set(scenario.id, stats)

    lines.push('')
    lines.push(`=== ${scenario.label}（${String(ATTEMPTS)} fights / strategy） ===`)
    lines.push('strategy       landed    lineBreak  escape   avgCmd  maxTension  endDist  endHook')

    for (const strategy of STRATEGY_ORDER) {
      const entry = stats.get(strategy)

      if (entry === undefined) {
        continue
      }

      lines.push(
        `${STRATEGY_LABELS[strategy].padEnd(14)} ` +
          `${pct(entry.landedRate).padStart(6)} (${String(entry.landed).padStart(2)}) ` +
          `${pct(entry.lineBreakRate).padStart(7)} ${pct(entry.hookEscapeRate).padStart(7)} ` +
          `${entry.avgCommands.toFixed(1).padStart(7)} ` +
          `${entry.avgMaxTensionRatio.toFixed(2).padStart(10)} ` +
          `${entry.avgDistanceM.toFixed(1).padStart(7)}m ` +
          `${entry.avgEndingHookHold.toFixed(2).padStart(7)}`,
      )
    }
  }

  const small = statsByScenario.get('small')
  const medium = statsByScenario.get('medium')
  const chinook = statsByScenario.get('chinook')
  const halibut = statsByScenario.get('halibut')

  const spamStrategies: readonly StrategyId[] = ['reel', 'power_reel', 'give']

  for (const [label, stats] of [['Chinook', chinook] as const, ['Halibut', halibut] as const]) {
    const reactive = stats?.get('reactive')

    checks.push({
      label: `${label}: Reactive は単一コマンド連打より着地率が高い`,
      ok:
        reactive !== undefined &&
        spamStrategies.every(
          (strategy) => reactive.landedRate > (stats?.get(strategy)?.landedRate ?? 1),
        ),
    })
  }

  const chinookReactive = chinook?.get('reactive')
  const halibutReactive = halibut?.get('reactive')
  const chinookGive = chinook?.get('give')
  const halibutGive = halibut?.get('give')
  const chinookPower = chinook?.get('power_reel')
  const halibutPower = halibut?.get('power_reel')
  const smallReel = small?.get('reel')
  const smallReactive = small?.get('reactive')
  const mediumReel = medium?.get('reel')

  checks.push({
    label: 'Always Give は安全戦略にならない（大型魚で HOOK_ESCAPE が出る）',
    ok: (chinookGive?.hookEscapeRate ?? 0) > 0.1 || (halibutGive?.hookEscapeRate ?? 0) > 0.1,
  })
  checks.push({
    label: 'Always Power Reel は LINE_BREAK を起こす（大型魚）',
    ok: (chinookPower?.lineBreakRate ?? 0) > 0.1 || (halibutPower?.lineBreakRate ?? 0) > 0.1,
  })
  checks.push({
    label: '小型魚のファイトは 3 コマンド以内',
    ok: (small?.get('reel')?.avgCommands ?? 99) <= 3,
  })
  checks.push({
    label: '小型魚はどの戦略でも取りこぼしが少ない',
    ok: (smallReel?.landedRate ?? 0) >= 0.9 && (smallReactive?.landedRate ?? 0) >= 0.9,
  })
  checks.push({
    label: '中型魚は数コマンドで決着する',
    ok: (mediumReel?.avgCommands ?? 0) <= 10 && (medium?.get('reactive')?.avgCommands ?? 0) <= 12,
  })
  checks.push({
    label: '大型魚のファイトは短すぎない（8 コマンド以上）',
    ok: (chinookReactive?.avgCommands ?? 0) >= 8 && (halibutReactive?.avgCommands ?? 0) >= 8,
  })
  checks.push({
    label: 'Reactive は大型魚で 50% 以上取り込める（Light でも絶望ではない）',
    ok: (chinookReactive?.landedRate ?? 0) >= 0.5 && (halibutReactive?.landedRate ?? 0) >= 0.5,
  })

  const again = simulateStrategy({
    content,
    scenario: scenarios()[0] as Scenario,
    strategy: 'reactive',
  })
  const deterministic = again.landed === small?.get('reactive')?.landed

  checks.push({ label: '同じ入力から同じ結果（決定論的）', ok: deterministic })

  lines.push('', '--- checks ---')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('')
  lines.push(allOk ? 'OK: text battle is decision-driven' : 'FAILED: text battle has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateTextBattle()

    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
