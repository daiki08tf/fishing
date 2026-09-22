import type { BuyerDefinition } from './Buyer'
import type { KeptCatch } from './FishBox'
import type { SpeciesTradeProfile } from './SpeciesTradeProfile'

/**
 * 売値の計算。deterministic（RNG を使わない）。
 *
 * 実際の市場価格を再現したものではない。すべて Phase 13 の PROVISIONAL gameplay tuning。
 *
 *   base species trade value × weight × condition factor × size quality factor
 *     × freshness × buyer affinity
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export type CatchQuality = {
  /** 0〜1。買取先の好みに沿っているかの目安（Trust 計算にも使う）。 */
  readonly score: number
  readonly conditionFactor: number
  readonly sizeFactor: number
  readonly freshnessFactor: number
}

export const resolveCatchQuality = (
  entry: KeptCatch,
  buyer: BuyerDefinition,
  profile: SpeciesTradeProfile,
  freshness: number,
): CatchQuality => {
  const conditionFactor =
    1 +
    buyer.pricingProfile.qualitySensitivity * profile.qualitySensitivity * (entry.condition - 0.5)
  const sizeFactor =
    1 +
    buyer.pricingProfile.sizeSensitivity *
      profile.sizeSensitivity *
      clamp((entry.percentile - 50) / 50, -1, 1)
  const freshnessFactor = 1 - buyer.pricingProfile.freshnessSensitivity * (1 - freshness)

  // 0〜1 の目安スコア（Trust 計算用）。中立 1.0 を 0.5 として正規化する。
  const score = clamp((conditionFactor + sizeFactor + freshnessFactor) / 3 - 0.5, 0, 1)

  return { score, conditionFactor, sizeFactor, freshnessFactor }
}

export const calcSaleValueYen = (
  entry: KeptCatch,
  buyer: BuyerDefinition,
  profile: SpeciesTradeProfile,
  freshness: number,
): number => {
  if (profile.tradeStatus !== 'tradable') {
    return 0
  }

  const quality = resolveCatchQuality(entry, buyer, profile, freshness)
  const raw =
    profile.baseYenPerKg *
    entry.weightKg *
    Math.max(0, quality.conditionFactor) *
    Math.max(0, quality.sizeFactor) *
    Math.max(0, quality.freshnessFactor) *
    buyer.pricingProfile.baseMultiplier

  return Math.round(Math.max(profile.minimumUnitValueYen, raw))
}
