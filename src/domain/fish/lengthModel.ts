import type { RandomSource } from '../rng/RandomSource'
import { clamp, normalCdf, roundTo, sampleStandardNormal, toPercentile } from './statistics'

/**
 * 魚種ごとの体長分布。DATA_MODEL.md §2 の LengthDistribution を正式化したもの。
 *
 * Phase 0B では「平均と標準偏差」だけの最小表現だった。Phase 2 で
 * 判別可能な union にし、将来は実データ由来の分布（empirical 等）を
 * 追加できる形にした。分布のロジックは魚種データから分離されている。
 *
 * どちらの分布も minCm / maxCm で打ち切る（clamp）。
 * 打ち切りは分布の形を保ったまま外れ値を防ぐための、意図的な簡易化である。
 * 実データ投入時は打ち切り点も現実の記録に合わせて設定する。
 */

/** 左右対称の分布。小型・大型が同程度に出現する魚種向け。 */
export type NormalLengthModel = {
  readonly kind: 'normal'
  readonly meanCm: number
  readonly standardDeviationCm: number
  readonly minCm: number
  readonly maxCm: number
}

/**
 * 右に裾を引く分布（対数正規）。
 * 通常サイズが大半で、大型になるほど急激に少なくなる。
 * medianCm は「中央値」、dispersion は対数空間の標準偏差。
 */
export type LogNormalLengthModel = {
  readonly kind: 'lognormal'
  readonly medianCm: number
  readonly dispersion: number
  readonly minCm: number
  readonly maxCm: number
}

export type LengthDistribution = NormalLengthModel | LogNormalLengthModel

/**
 * 体長を 1 つ引く。
 * 乱数の消費は 2 回で固定（分布の種類によらず同じ）。
 */
export const sampleLengthCm = (model: LengthDistribution, random: RandomSource): number => {
  const standard = sampleStandardNormal(random)

  const raw =
    model.kind === 'normal'
      ? model.meanCm + model.standardDeviationCm * standard
      : model.medianCm * Math.exp(model.dispersion * standard)

  return roundTo(clamp(raw, model.minCm, model.maxCm), 1)
}

/**
 * その体長が魚種の分布上でどのあたりに位置するか（0〜100）。
 *
 * 99 なら「上位 1% の大型」、50 なら「ちょうど中央」を意味する。
 * 将来 XP / Trophy / Record / Reputation の入力になる（Phase 2 では未接続）。
 */
export const lengthPercentile = (model: LengthDistribution, lengthCm: number): number => {
  if (model.kind === 'normal') {
    const z = (lengthCm - model.meanCm) / model.standardDeviationCm
    return toPercentile(normalCdf(z))
  }

  // 対数正規は対数を取れば正規分布になる。
  const z = Math.log(lengthCm / model.medianCm) / model.dispersion
  return toPercentile(normalCdf(z))
}

/** 分布の代表値。統計テストや表示に使う。 */
export const lengthModelMedian = (model: LengthDistribution): number =>
  model.kind === 'normal' ? model.meanCm : model.medianCm
