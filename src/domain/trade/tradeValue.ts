import type { BuyerDefinition } from './Buyer'
import type { KeptCatch } from './FishBox'
import type { SpeciesTradeProfile } from './SpeciesTradeProfile'
import type { TradeTag } from './TradeTag'

/**
 * 売値の計算。deterministic（RNG を使わない）。
 *
 * 実際の市場価格を再現したものではない。すべて Phase 13 の PROVISIONAL gameplay tuning。
 *
 *   base species trade value × weight × condition factor × size quality factor
 *     × freshness × buyer affinity（quality / size / freshness）
 *     × trade tag affinity（魚種の性格 × 買取先の好み）
 *     × local source bonus（産地 === 買取先の地域）
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

/** 1 つのタグに対する買取先の倍率。 */
export const tagAffinityOf = (buyer: BuyerDefinition, tag: TradeTag): number => {
  const preferences = buyer.preferences

  if (preferences.preferredTags.includes(tag)) {
    return preferences.preferredTagMultiplier
  }

  if (preferences.neutralTags.includes(tag)) {
    return preferences.neutralTagMultiplier
  }

  return preferences.otherTagMultiplier
}

/**
 * 魚種のタグ集合と買取先の好みから倍率を解決する。
 *
 * タグが複数ある魚は「一番相性の良いタグ」で評価する（順序に依存しない）。
 * タグが 1 つも無い profile（unpriced / non_tradable など）は中立 1。
 */
export const resolveTagAffinity = (
  profile: SpeciesTradeProfile,
  buyer: BuyerDefinition,
): number => {
  if (profile.tradeTags.length === 0) {
    return 1
  }

  return Math.max(...profile.tradeTags.map((tag) => tagAffinityOf(buyer, tag)))
}

/** 産地が買取先の地域と一致するときの倍率。 */
export const resolveLocalSourceMultiplier = (entry: KeptCatch, buyer: BuyerDefinition): number =>
  String(entry.sourceRegionId) === String(buyer.regionId)
    ? buyer.preferences.localSourceMultiplier
    : 1

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
  const tagAffinity = resolveTagAffinity(profile, buyer)
  const localSource = resolveLocalSourceMultiplier(entry, buyer)
  const raw =
    profile.baseYenPerKg *
    entry.weightKg *
    Math.max(0, quality.conditionFactor) *
    Math.max(0, quality.sizeFactor) *
    Math.max(0, quality.freshnessFactor) *
    buyer.pricingProfile.baseMultiplier *
    tagAffinity *
    localSource

  return Math.round(Math.max(profile.minimumUnitValueYen, raw))
}
