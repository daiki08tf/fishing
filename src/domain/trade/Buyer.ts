import type { ContactId, RegionId } from '../ids'
import type { TradeTag } from './TradeTag'

/**
 * 買取先（Phase 13）。Buyer は Contact の一種として同じ ID 空間（ContactId）を使う。
 *
 * 具体的な店名・魚種 ID で Domain を分岐しない。差は BuyerDefinition の
 * チューニング値（pricingProfile / preferences / trustProfile）から解決する。
 */
export const BUYER_TYPES = ['izakaya', 'wholesaler', 'market'] as const
export type BuyerType = (typeof BUYER_TYPES)[number]

/** 価格計算の基礎倍率。魚種の基礎価値（SpeciesTradeProfile）へ掛かる。 */
export type BuyerPricingProfile = {
  /** この買取先全体の基礎倍率。 */
  readonly baseMultiplier: number
  /** condition（0〜1、0.5 を中立とする）への感度。 */
  readonly qualitySensitivity: number
  /** サイズ百分位（50 を中立とする）への感度。 */
  readonly sizeSensitivity: number
  /** 鮮度への感度（0 なら鮮度を気にしない）。 */
  readonly freshnessSensitivity: number
  /** 卸のような「まとめて持ち込むほど有利」を表す、1 匹あたりの数量ボーナス上限。 */
  readonly volumeBonusPerExtraCatch: number
  readonly maxVolumeBonus: number
}

/** Trust 付与の調整値。1 回の取引で一気に 100 へ到達しないよう上限を持つ。 */
export type BuyerTrustProfile = {
  readonly perTransactionBase: number
  /** 平均 quality（0〜1）に応じて加算する量。 */
  readonly qualityWeight: number
  readonly maxPerTransaction: number
}

/**
 * 魚種タグ（SpeciesTradeProfile.tradeTags）への好み。
 *
 * 魚種 ID を直接持たない。「居酒屋は maaji」のようなどこかで魚種 ID を
 * 分岐する設計を避け、買取先の性格だけを data-driven で表現する。
 * 複数タグを持つ魚は **最も相性の良いタグ** で評価する（max）。
 */
export type BuyerPreferenceProfile = {
  /** もっとも高く評価するタグ。 */
  readonly preferredTags: readonly TradeTag[]
  /** 普通に扱うタグ（preferred でも other でもない）。 */
  readonly neutralTags: readonly TradeTag[]
  readonly preferredTagMultiplier: number
  readonly neutralTagMultiplier: number
  /** どちらにも無いタグの倍率。1 に近いほど「何でも広く扱う」。 */
  readonly otherTagMultiplier: number
  /**
   * 産地が自分の地域と一致する魚（KeptCatch.sourceRegionId === buyer.regionId）を
   * 少し評価する倍率（地元の魚を優遇する）。
   */
  readonly localSourceMultiplier: number
}

export type BuyerDefinition = {
  readonly id: ContactId
  readonly name: string
  readonly buyerType: BuyerType
  readonly regionId: RegionId
  readonly description: string
  readonly pricingProfile: BuyerPricingProfile
  readonly trustProfile: BuyerTrustProfile
  /** Phase 13.1: 魚種タグの好み（data-driven）。 */
  readonly preferences: BuyerPreferenceProfile
}
