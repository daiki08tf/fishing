import type { RandomSource } from '../rng/RandomSource'

/**
 * 個体生成で使う統計ユーティリティ。
 *
 * Domain 内で完結させるため、外部パッケージに依存しない。
 * 乱数は必ず注入された RandomSource から引く（Math.random は使わない）。
 */

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const clamp01 = (value: number): number => clamp(value, 0, 1)

export const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * 標準正規分布に従う値を 1 つ引く（Box-Muller）。
 * 乱数は 2 回消費する。消費回数を固定したいので常に 2 回引く。
 */
export const sampleStandardNormal = (random: RandomSource): number => {
  const first = Math.max(random.next(), Number.EPSILON)
  const second = random.next()
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)
}

/** 誤差関数（Abramowitz & Stegun 7.1.26）。精度は約 1e-7。 */
const erf = (value: number): number => {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value)
  const t = 1 / (1 + 0.3275911 * x)
  const polynomial =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  return sign * (1 - polynomial * Math.exp(-x * x))
}

/** 標準正規分布の累積分布関数。 */
export const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2))

/**
 * 0〜100 の百分位に変換する。
 * 100 に近いほど「その魚種の中では珍しい大きさ」を意味する。
 */
export const toPercentile = (cumulativeProbability: number): number =>
  clamp(cumulativeProbability * 100, 0, 100)
