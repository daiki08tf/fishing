import {
  NEUTRAL_FISHING_MODIFIERS,
  type PlayerFishingModifiers,
} from '../fishing/PlayerFishingModifiers'
import type { FishSpecies } from '../fish/FishSpecies'
import {
  TIDE_LABELS,
  TIME_OF_DAY_LABELS,
  WATER_FLOW_LABELS,
  WATER_KIND_LABELS,
  WEATHER_LABELS,
  type EnvironmentSnapshot,
} from './Environment'

/**
 * Fishing Conditions Resolver（Phase 9）。
 *
 *   Environment + Spot + Species + Method + Tackle
 *     ↓
 *   resolved numerical modifiers（Encounter の重み / Fight の倍率）
 *
 * FishingEngine は雨も潮も季節も国も知らない。ここで解決した数値だけを受け取る。
 * 同じ (環境, Spot, 魚種, 釣法, 装備) なら常に同じ結果になる（乱数を使わない）。
 */

export const CONDITION_SUMMARIES = ['excellent', 'good', 'fair', 'tough'] as const
export type ConditionSummary = (typeof CONDITION_SUMMARIES)[number]

export const CONDITION_SUMMARY_LABELS: Readonly<Record<ConditionSummary, string>> = {
  excellent: 'Excellent（絶好）',
  good: 'Good（良好）',
  fair: 'Fair（ふつう）',
  tough: 'Tough（渋い）',
}

/** 魚種ごとの環境嗜好（Content）。未設定は 1（neutral）。 */
export type SpeciesEnvironmentAffinity = {
  readonly preferredSeasons?: readonly string[]
  readonly preferredTimeOfDay?: readonly string[]
  readonly weatherAffinity?: Readonly<Record<string, number>>
  readonly tideAffinity?: Readonly<Record<string, number>>
  readonly flowAffinity?: Readonly<Record<string, number>>
  /** 好む水温（℃）。外側は徐々に下がる。 */
  readonly preferredTemperatureC?: { readonly min: number; readonly max: number }
}

export type FishingConditions = {
  readonly summary: ConditionSummary
  /** 魚種 ID → Encounter の重み倍率（0 にはならない）。 */
  readonly speciesModifiers: Readonly<Record<string, number>>
  /** Encounter 全体のヒットしやすさ（倍率）。 */
  readonly biteAffinityMultiplier: number
  /** 装備・技量の modifier に重ねる環境由来の modifier。 */
  readonly playerModifiers: PlayerFishingModifiers
  /** プレイヤー向けの短い説明（UI にそのまま出せる）。 */
  readonly notes: readonly string[]
  /** 魚の気配（Knowledge が低いときは曖昧な表現にする）。 */
  readonly activityLabel: string
  /** 狙いやすい魚種 ID（Knowledge / Fish Finder の精度で変わる）。 */
  readonly speciesHintIds: readonly string[]
  /** 釣況スコア（表示用の summary。唯一の真実にはしない）。 */
  readonly score: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** 倍率が 0 にならないようにする下限（「絶対に釣れない」を作らない）。 */
const MIN_SPECIES_MULTIPLIER = 0.35
const MAX_SPECIES_MULTIPLIER = 2.4

const temperatureFactor = (
  temperatureC: number,
  preferred: { readonly min: number; readonly max: number } | undefined,
): number => {
  if (preferred === undefined) {
    return 1
  }

  if (temperatureC >= preferred.min && temperatureC <= preferred.max) {
    return 1.25
  }

  const span = Math.max(2, preferred.max - preferred.min)
  const distance =
    temperatureC < preferred.min ? preferred.min - temperatureC : temperatureC - preferred.max

  return clamp(1.25 - distance / span, 0.6, 1.25)
}

/**
 * 1 魚種の環境による Encounter 重み倍率。
 *
 * 良い条件では明確に上がり、悪い条件では下がるが 0 にはしない。
 */
export const speciesEnvironmentMultiplier = (
  species: FishSpecies,
  environment: EnvironmentSnapshot,
): number => {
  const affinity = affinityOf(species)

  if (affinity === undefined) {
    return 1
  }

  let multiplier = 1

  if (affinity.preferredSeasons !== undefined && affinity.preferredSeasons.length > 0) {
    multiplier *= affinity.preferredSeasons.includes(environment.season) ? 1.25 : 0.85
  }

  if (affinity.preferredTimeOfDay !== undefined && affinity.preferredTimeOfDay.length > 0) {
    multiplier *= affinity.preferredTimeOfDay.includes(environment.timeOfDay) ? 1.3 : 0.85
  }

  multiplier *= affinity.weatherAffinity?.[environment.weather] ?? 1

  if (environment.tide !== null) {
    multiplier *= affinity.tideAffinity?.[environment.tide] ?? 1
  }

  multiplier *= affinity.flowAffinity?.[environment.water.flow] ?? 1
  multiplier *= temperatureFactor(environment.water.temperatureC, affinity.preferredTemperatureC)

  return clamp(multiplier, MIN_SPECIES_MULTIPLIER, MAX_SPECIES_MULTIPLIER)
}

/** FishSpecies から環境嗜好を取り出す（Content が無い魚は neutral）。 */
const affinityOf = (species: FishSpecies): SpeciesEnvironmentAffinity | undefined =>
  (species as { readonly environmentAffinity?: SpeciesEnvironmentAffinity }).environmentAffinity

export type SearchSign = 'weak' | 'moderate' | 'strong' | 'large'

export const SEARCH_SIGN_LABELS: Readonly<Record<SearchSign, string>> = {
  weak: '反応は弱い',
  moderate: '反応あり',
  strong: '反応が強い',
  large: '大型の反応',
}

const signBiteBonus: Readonly<Record<SearchSign, number>> = {
  weak: 1,
  moderate: 1.05,
  strong: 1.12,
  large: 1.18,
}

const signSpeciesBonus: Readonly<Record<SearchSign, number>> = {
  weak: 1,
  moderate: 1.08,
  strong: 1.18,
  large: 1.3,
}

const summaryFor = (score: number): ConditionSummary => {
  if (score >= 1.35) {
    return 'excellent'
  }

  if (score >= 1.1) {
    return 'good'
  }

  if (score >= 0.85) {
    return 'fair'
  }

  return 'tough'
}

const activityLabelFor = (summary: ConditionSummary, knowledgeScore: number): string => {
  if (knowledgeScore < 20) {
    return summary === 'tough' ? '気配は少ない' : '気配はある'
  }

  switch (summary) {
    case 'excellent':
      return '魚の気配: 濃い（活性が高い）'
    case 'good':
      return '魚の気配: 良好'
    case 'fair':
      return '魚の気配: ふつう'
    case 'tough':
      return '魚の気配: 薄い（渋い）'
  }
}

const visibilityModifier = (environment: EnvironmentSnapshot, hasFishFinder: boolean): number => {
  let value = 1 + (environment.water.clarity - 0.6) * 0.35

  if (environment.weather === 'rain' || environment.weather === 'windy') {
    value -= 0.08
  }

  if (environment.water.flow === 'strong') {
    value -= 0.05
  }

  if (hasFishFinder) {
    value += 0.08
  }

  return clamp(value, 0.75, 1.25)
}

const flowPressure = (environment: EnvironmentSnapshot): number => {
  switch (environment.water.flow) {
    case 'strong':
      return 1.12
    case 'moderate':
      return 1.04
    case 'slow':
      return 1
    default:
      return 0.96
  }
}

/**
 * 条件を解決する。
 *
 * @param input.tackleModifiers 装備から解決済みの倍率（環境と合成する）
 * @param input.searchSign Fish Finder の Search Water 結果（未実施なら null）
 */
export const resolveFishingConditions = (input: {
  readonly environment: EnvironmentSnapshot
  readonly species: readonly FishSpecies[]
  readonly tackleModifiers: PlayerFishingModifiers
  readonly hasFishFinder: boolean
  readonly searchSign: SearchSign | null
  readonly knowledgeScore: number
}): FishingConditions => {
  const { environment } = input
  const speciesModifiers: Record<string, number> = {}
  let total = 0

  for (const species of input.species) {
    const base = speciesEnvironmentMultiplier(species, environment)
    const withSearch = input.searchSign === null ? base : base * signSpeciesBonus[input.searchSign]
    const value = clamp(withSearch, MIN_SPECIES_MULTIPLIER, MAX_SPECIES_MULTIPLIER)

    speciesModifiers[String(species.id)] = Math.round(value * 100) / 100
    total += value
  }

  const average = input.species.length === 0 ? 1 : total / input.species.length
  const summary = summaryFor(average)
  const biteAffinityMultiplier = clamp(
    (0.9 + 0.25 * average) * (input.searchSign === null ? 1 : signBiteBonus[input.searchSign]),
    0.7,
    1.6,
  )

  const playerModifiers: PlayerFishingModifiers = {
    ...NEUTRAL_FISHING_MODIFIERS,
    detectionClarityMultiplier:
      input.tackleModifiers.detectionClarityMultiplier *
      visibilityModifier(environment, input.hasFishFinder),
    tensionGainMultiplier: input.tackleModifiers.tensionGainMultiplier * flowPressure(environment),
    hookSuccessModifier:
      input.tackleModifiers.hookSuccessModifier +
      (summary === 'excellent'
        ? 0.06
        : summary === 'good'
          ? 0.03
          : summary === 'tough'
            ? -0.05
            : 0),
  }

  const notes: readonly string[] = [
    `天候: ${WEATHER_LABELS[environment.weather]}`,
    `季節: ${environment.season === 'spring' ? '春' : environment.season === 'summer' ? '夏' : environment.season === 'autumn' ? '秋' : '冬'} / ${TIME_OF_DAY_LABELS[environment.timeOfDay]}`,
    environment.tide === null
      ? `潮: なし（${WATER_KIND_LABELS[environment.water.kind]}）`
      : `潮: ${TIDE_LABELS[environment.tide]}`,
    `水温: ${String(environment.water.temperatureC)}℃ / 濁り: ${
      environment.water.clarity >= 0.7
        ? '澄んでいる'
        : environment.water.clarity >= 0.45
          ? 'ふつう'
          : '濁り気味'
    }`,
    `流れ: ${WATER_FLOW_LABELS[environment.water.flow]}${
      environment.water.kind === 'freshwater'
        ? ''
        : ` / 風: ${environment.water.wind === 'strong' ? '強い' : environment.water.wind === 'breezy' ? 'やや風' : '穏やか'}`
    }`,
  ]

  const hinted = Object.entries(speciesModifiers)
    .filter(([, value]) => value >= 1.1)
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id)

  return {
    summary,
    speciesModifiers,
    biteAffinityMultiplier: Math.round(biteAffinityMultiplier * 100) / 100,
    playerModifiers,
    notes,
    activityLabel: activityLabelFor(summary, input.knowledgeScore),
    // 狙いやすい魚は Knowledge / Fish Finder がある程度ないと絞り込まない。
    speciesHintIds:
      input.knowledgeScore >= 40 || input.hasFishFinder ? hinted.slice(0, 3) : hinted.slice(0, 1),
    score: Math.round(average * 100) / 100,
  }
}
