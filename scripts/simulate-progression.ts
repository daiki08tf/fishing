import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { resolveCatch } from '../src/domain/catch'
import { emptyCodexState, type CodexState } from '../src/domain/codex'
import { generateFishIndividual } from '../src/domain/fish/generateFishIndividual'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import {
  allocateSkillPoints,
  applyCatchToProgression,
  createInitialProgression,
  DEFAULT_PROGRESSION_TUNING,
  PERK_DEFINITIONS,
  unlockPerks,
  xpToNext,
  type AnglerProgression,
  type XpBreakdown,
} from '../src/domain/progression'
import type { AnglerSkill } from '../src/domain/progression'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'

/**
 * 成長ループのシミュレーション。
 *
 * 多数の釣果を流し、次を決定論的に確認する。
 * - Lv100 に到達できる / 到達後に増えない
 * - XP の溢れ・負値・NaN がない
 * - 同じ魚の反復では効率が大きく落ちる
 * - 初捕獲と大型個体（高百分位）が有意に価値を持つ
 * - 大量 XP で複数レベルが同時に上がる
 *
 * 使い方:
 *   npm run simulate:progression
 *   npm run simulate:progression -- --catches 5000
 */

export type ScenarioResult = {
  readonly label: string
  readonly catches: number
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly totalXpGained: number
  readonly firstCatchXp: number
  readonly lastCatchXp: number
}

export type ProgressionSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly { readonly label: string; readonly ok: boolean }[]
  readonly scenarios: readonly ScenarioResult[]
}

/** 指定した魚種を順番に釣り続ける。 */
export const runScenario = (options: {
  readonly label: string
  readonly species: readonly FishSpecies[]
  readonly catches: number
  readonly seed: string
  readonly spotId?: string
}): ScenarioResult => {
  const random = new SeededRandomSource(options.seed)
  let codex = emptyCodexState()
  let progression = createInitialProgression()
  let totalXpGained = 0
  let firstCatchXp = 0
  let lastCatchXp = 0

  for (let index = 0; index < options.catches; index += 1) {
    const species = options.species[index % options.species.length]

    if (species === undefined) {
      throw new Error('no species to fish for')
    }

    const generated = generateFishIndividual({
      species,
      random,
      individualSeed: `${String(species.id)}#sim#${String(index)}`,
    })

    const resolution = resolveCatch({
      individual: generated.individual,
      species,
      codex,
      progression,
      ...(options.spotId === undefined ? {} : { spotId: options.spotId }),
      capturedAt: '2026-01-01T00:00:00.000Z',
    })

    codex = resolution.codex
    progression = resolution.progression
    totalXpGained += resolution.xp.total
    lastCatchXp = resolution.xp.total

    if (index === 0) {
      firstCatchXp = resolution.xp.total
    }
  }

  return {
    label: options.label,
    catches: options.catches,
    progression,
    codex,
    totalXpGained,
    firstCatchXp,
    lastCatchXp,
  }
}

/** XP の塊を与えたときの成長（上限の確認に使う）。 */
export const grantXp = (progression: AnglerProgression, amount: number): AnglerProgression => {
  const xp: XpBreakdown = {
    base: amount,
    sizeMultiplier: 1,
    sizeBand: 'synthetic',
    challengeMultiplier: 1,
    decayMultiplier: 1,
    discoveryBonus: 0,
    total: amount,
    factors: [],
  }

  return applyCatchToProgression({
    progression,
    xp,
    speciesId: 'synthetic',
  }).progression
}

const formatProgression = (progression: AnglerProgression): string =>
  `Lv${String(progression.anglerLevel)} xp ${String(progression.anglerXp)} / ${String(
    xpToNext(progression),
  )} total ${String(progression.totalXp)} SP ${String(progression.skillPoints)} perks ${String(
    progression.unlockedPerks.length,
  )}`

/** Skill Point を目標値まで割り振り、その都度 Perk の解禁判定を行う。 */
export const spendInto = (
  progression: AnglerProgression,
  skill: AnglerSkill,
  target: number,
): AnglerProgression => {
  let current = progression

  while (current.skills[skill] < target && current.skillPoints > 0) {
    const outcome = allocateSkillPoints({
      skills: current.skills,
      skillPoints: current.skillPoints,
      skill,
      amount: 1,
    })

    if (!outcome.ok) {
      break
    }

    current = unlockPerks({
      ...current,
      skills: outcome.skills,
      skillPoints: outcome.skillPoints,
    }).progression
  }

  return current
}

export const simulateProgression = (options: {
  readonly catches: number
  readonly seed: string
}): ProgressionSimulationResult => {
  const content = loadContentFromDirectory()
  const primary = content.species[0]

  if (primary === undefined) {
    throw new Error('content has no species')
  }

  const spotId = String(content.primarySpot.id)

  const farming = runScenario({
    label: 'same species farming',
    species: [primary],
    catches: options.catches,
    seed: `${options.seed}#farm`,
    spotId,
  })

  const mixed = runScenario({
    label: 'mixed species play',
    species: content.species,
    catches: options.catches,
    seed: `${options.seed}#mixed`,
    spotId,
  })

  const repeated = runScenario({
    label: 'mixed species play (repeat run)',
    species: content.species,
    catches: options.catches,
    seed: `${options.seed}#mixed`,
    spotId,
  })

  // Lv100 に到達し、それ以上増えないこと。
  const maxed = grantXp(createInitialProgression(), 10_000_000)
  const maxedAgain = grantXp(maxed, 10_000_000)

  // Skill Point を割り振って Perk が解禁されること。
  const withPerks = spendInto(spendInto(mixed.progression, 'casting', 10), 'detection', 15)

  // 序盤の 1 匹と、同じ魚を釣り続けた終盤の 1 匹。
  const checks = [
    {
      label: 'Lv100 に到達できる',
      ok: maxed.anglerLevel === DEFAULT_PROGRESSION_TUNING.maxLevel,
    },
    {
      label: 'Lv100 到達後にレベルが増えない',
      ok: maxedAgain.anglerLevel === DEFAULT_PROGRESSION_TUNING.maxLevel,
    },
    {
      label: 'Lv100 で XP が溢れない',
      ok: maxedAgain.anglerXp === 0 && Number.isFinite(maxedAgain.totalXp),
    },
    {
      label: 'XP に NaN / 負値がない',
      ok: [farming, mixed].every(
        (scenario) =>
          Number.isFinite(scenario.totalXpGained) &&
          scenario.totalXpGained > 0 &&
          Number.isFinite(scenario.progression.totalXp) &&
          scenario.progression.totalXp >= 0,
      ),
    },
    {
      label: '反復では効率が大きく落ちる（最初 > 最後）',
      ok: farming.firstCatchXp > farming.lastCatchXp,
    },
    {
      label: '多様な釣りは同じ魚の反復より効率的',
      ok: mixed.progression.totalXp > farming.progression.totalXp,
    },
    {
      label: '同じ入力から同じ結果（決定論的）',
      ok:
        mixed.progression.totalXp === repeated.progression.totalXp &&
        mixed.progression.anglerLevel === repeated.progression.anglerLevel,
    },
    {
      label: '大量 XP で複数レベルが同時に上がる',
      ok: grantXp(createInitialProgression(), 2000).anglerLevel > 3,
    },
    {
      label: 'Skill Point を割り振ると Perk が解禁される',
      ok: withPerks.unlockedPerks.length >= 2,
    },
  ]

  const lines: string[] = [
    `catches per scenario: ${String(options.catches)} seed: ${options.seed}`,
    '',
  ]

  for (const scenario of [farming, mixed]) {
    lines.push(`--- ${scenario.label} ---`)
    lines.push(`  ${formatProgression(scenario.progression)}`)
    lines.push(
      `  xp gained ${String(scenario.totalXpGained)} (first catch ${String(
        scenario.firstCatchXp,
      )} / last catch ${String(scenario.lastCatchXp)})`,
    )
    lines.push(`  species recorded ${String(Object.keys(scenario.codex.species).length)}`)
    lines.push('')
  }

  lines.push('--- bounds ---')
  lines.push(`  huge XP grant → ${formatProgression(maxed)}`)
  lines.push(`  grant again    → ${formatProgression(maxedAgain)}`)
  lines.push(
    `  after spending skill points → perks: ${
      withPerks.unlockedPerks.length === 0
        ? '—'
        : withPerks.unlockedPerks.map((perk) => PERK_DEFINITIONS[perk].name).join(', ')
    }`,
  )
  lines.push('')
  lines.push('--- checks ---')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('')
  lines.push(allOk ? 'OK: progression loop is healthy' : 'FAILED: progression loop has problems')

  return {
    exitCode: allOk ? 0 : 1,
    lines,
    checks,
    scenarios: [farming, mixed],
  }
}

const parseArguments = (argv: readonly string[]): { catches: number; seed: string } => {
  let catches = 2000
  let seed = 'progression'

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (argument === '--catches' && value !== undefined) {
      catches = Number.parseInt(value, 10)
      index += 1
      continue
    }

    if (argument === '--seed' && value !== undefined) {
      seed = value
      index += 1
    }
  }

  return { catches, seed }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateProgression(parseArguments(process.argv.slice(2)))

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
