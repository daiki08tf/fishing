import type { ContactId, RegionId } from '../ids'

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

export type BuyerDefinition = {
  readonly id: ContactId
  readonly name: string
  readonly buyerType: BuyerType
  readonly regionId: RegionId
  readonly description: string
  readonly pricingProfile: BuyerPricingProfile
  readonly trustProfile: BuyerTrustProfile
}
