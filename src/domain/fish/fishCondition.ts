import type { RandomSource } from '../rng/RandomSource'
import { clamp, clamp01 } from './statistics'

/**
 * 個体のコンディション（体格の良し悪し）。
 *
 * GAME_DESIGN.md §5.2 の個体差に対応する内部値。
 * 0〜1 の連続値として保持し、表示用の区分は別に導出する
 * （UI 表示形式は後から変更できるようにするため）。
 */

export const CONDITION_BANDS = ['thin', 'standard', 'good', 'excellent'] as const
export type ConditionBand = (typeof CONDITION_BANDS)[number]

/** 魚種ごとのコンディションのばらつき設定。 */
export type ConditionModel = {
  /** 0〜1。大きいほど痩せ・良好の振れ幅が大きい。 */
  readonly variability: number
}

export const DEFAULT_CONDITION_MODEL: ConditionModel = {
  variability: 0.5,
}

/**
 * コンディションを 1 つ引く。
 *
 * 一様乱数 2 回の平均を使う（中心寄りの三角分布）。
 * 乱数の消費は 2 回で固定。
 */
export const sampleCondition = (random: RandomSource, model: ConditionModel): number => {
  const first = random.next()
  const second = random.next()
  const centered = (first + second) / 2
  const spread = 0.4 + 1.6 * clamp01(model.variability)

  return clamp01(0.5 + (centered - 0.5) * spread)
}

/** コンディションの表示区分。 */
export const conditionBand = (condition: number): ConditionBand => {
  if (condition < 0.2) {
    return 'thin'
  }

  if (condition < 0.65) {
    return 'standard'
  }

  if (condition < 0.9) {
    return 'good'
  }

  return 'excellent'
}

/**
 * 体重への軽い影響。
 * 痩せ型で 0.85、標準で 1.0、非常に良好で 1.15 程度になる。
 */
export const conditionWeightFactor = (condition: number): number =>
  clamp(0.85 + 0.3 * clamp01(condition), 0.8, 1.2)
