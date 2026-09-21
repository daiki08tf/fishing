import type { RandomSource } from '../rng/RandomSource'
import type { FishTrait } from './FishTrait'
import { clamp01 } from './statistics'

/**
 * Trait（個体差）。DATA_MODEL.md §4 の候補に対応する。
 *
 * 方針:
 * - Trait は現実的な個体差として説明できるものに限る（魔法の能力は禁止）。
 * - 効果は「Modifier の表」として持ち、Fishing Engine に
 *   Trait ごとの if 文を書かない。Trait を追加しても Engine は変わらない。
 * - Trophy は乱数ではなく size percentile から決める（GAME_DESIGN.md §6）。
 */

/** Trait がファイトへ与える倍率。すべて 1.0 が「効果なし」。 */
export type TraitModifiers = {
  readonly staminaMultiplier: number
  readonly powerMultiplier: number
  readonly speedMultiplier: number
  /** run の起こりやすさ。 */
  readonly runChanceMultiplier: number
  /** run の持続時間。 */
  readonly runDurationMultiplier: number
}

export const NO_TRAIT_MODIFIERS: TraitModifiers = {
  staminaMultiplier: 1,
  powerMultiplier: 1,
  speedMultiplier: 1,
  runChanceMultiplier: 1,
  runDurationMultiplier: 1,
}

/**
 * Trait ごとの効果表。
 *
 * Heavy は「同じ体長でも重い」ことをコンディション由来の体重で表現しているため、
 * ここでは体重倍率を持たない（二重に掛けない）。
 * Scarred は数値効果を持たず、個体の identity としてのみ保持する。
 */
export const TRAIT_MODIFIERS: Readonly<Record<FishTrait, TraitModifiers>> = {
  trophy: {
    staminaMultiplier: 1.25,
    powerMultiplier: 1.1,
    speedMultiplier: 1,
    runChanceMultiplier: 1,
    runDurationMultiplier: 1,
  },
  strong_runner: {
    staminaMultiplier: 1,
    powerMultiplier: 1,
    speedMultiplier: 1.15,
    runChanceMultiplier: 1.6,
    runDurationMultiplier: 1.35,
  },
  heavy: {
    staminaMultiplier: 0.95,
    powerMultiplier: 1.15,
    speedMultiplier: 0.95,
    runChanceMultiplier: 0.9,
    runDurationMultiplier: 1,
  },
  old: {
    staminaMultiplier: 0.9,
    powerMultiplier: 1.05,
    speedMultiplier: 0.85,
    runChanceMultiplier: 0.75,
    runDurationMultiplier: 0.9,
  },
  scarred: {
    staminaMultiplier: 1,
    powerMultiplier: 1,
    speedMultiplier: 1,
    runChanceMultiplier: 1,
    runDurationMultiplier: 1,
  },
  aggressive: {
    staminaMultiplier: 1.05,
    powerMultiplier: 1,
    speedMultiplier: 1.05,
    runChanceMultiplier: 1.45,
    runDurationMultiplier: 1.1,
  },
}

/** 複数 Trait の効果をまとめる。効果は乗算で合成する。 */
export const combineTraitModifiers = (traits: readonly FishTrait[]): TraitModifiers => {
  let combined: TraitModifiers = NO_TRAIT_MODIFIERS

  for (const trait of traits) {
    const modifier = TRAIT_MODIFIERS[trait]
    combined = {
      staminaMultiplier: combined.staminaMultiplier * modifier.staminaMultiplier,
      powerMultiplier: combined.powerMultiplier * modifier.powerMultiplier,
      speedMultiplier: combined.speedMultiplier * modifier.speedMultiplier,
      runChanceMultiplier: combined.runChanceMultiplier * modifier.runChanceMultiplier,
      runDurationMultiplier: combined.runDurationMultiplier * modifier.runDurationMultiplier,
    }
  }

  return combined
}

/**
 * 魚種ごとの Trait 抽選設定。
 * Content 側で部分的に上書きでき、省略時は既定値を使う。
 */
export type TraitConfiguration = {
  /** この百分位以上を Trophy とする。1 なら上位 1%。 */
  readonly trophyPercentileThreshold: number
  readonly oldChance: number
  readonly scarredChance: number
  readonly aggressiveChance: number
  readonly strongRunnerChance: number
  /** 標準体重に対する比がこれ以上なら Heavy。 */
  readonly heavyWeightRatioThreshold: number
}

export type TraitConfigurationOverride = Partial<TraitConfiguration>

export const DEFAULT_TRAIT_CONFIGURATION: TraitConfiguration = {
  trophyPercentileThreshold: 1,
  oldChance: 0.06,
  scarredChance: 0.05,
  aggressiveChance: 0.07,
  strongRunnerChance: 0.06,
  heavyWeightRatioThreshold: 1.08,
}

export const resolveTraitConfiguration = (
  override: TraitConfigurationOverride | undefined,
): TraitConfiguration => ({ ...DEFAULT_TRAIT_CONFIGURATION, ...override })

export type TraitResolutionContext = {
  readonly configuration: TraitConfiguration
  /** 同種サイズ分布での百分位（0〜100）。 */
  readonly percentile: number
  /** 標準体重に対する比。 */
  readonly weightRatio: number
  /** 魚種のスピード（0〜1）。 */
  readonly speciesSpeed: number
}

/**
 * Trait を決定する。
 *
 * 乱数の消費は常に 4 回（old / scarred / aggressive / strong_runner）。
 * 成立しなかった場合も引くため、消費回数は結果に依存しない。
 * 決定論と「同じ seed なら同じ個体」を守るための設計である。
 */
export const resolveTraits = (
  context: TraitResolutionContext,
  random: RandomSource,
): readonly FishTrait[] => {
  const { configuration, percentile, weightRatio, speciesSpeed } = context
  const traits: FishTrait[] = []

  // Trophy は乱数ではなくサイズから決まる。
  if (percentile >= 100 - configuration.trophyPercentileThreshold) {
    traits.push('trophy')
  }

  // Heavy も体格から決まる（重い個体）。
  if (weightRatio >= configuration.heavyWeightRatioThreshold) {
    traits.push('heavy')
  }

  // 加齢個体は大型に偏る。
  const oldChance = clamp01(configuration.oldChance * (0.5 + percentile / 100))
  if (random.next() < oldChance) {
    traits.push('old')
  }

  if (random.next() < clamp01(configuration.scarredChance)) {
    traits.push('scarred')
  }

  if (random.next() < clamp01(configuration.aggressiveChance)) {
    traits.push('aggressive')
  }

  // 速い魚種ほど走る個体が出やすい。
  const runnerChance = clamp01(configuration.strongRunnerChance * (0.6 + 0.8 * speciesSpeed))
  if (random.next() < runnerChance) {
    traits.push('strong_runner')
  }

  return traits
}
