import type { FishSpeciesId } from '../ids'

/**
 * 魚種の取引状態（Phase 13）。
 *
 * 「希少な魚 = 市場価値が高い」とは限らないため、生物データ（FishSpecies.rarity）と
 * 経済データ（ここ）を分離する。全 runtime Species はここで
 * tradable / unpriced / non_tradable / unverified のいずれかを明示する
 * （validate:content が未指定を検出する）。
 *
 * 実在の販売可否・漁業法・遊漁規制を検証したという意味ではない。
 * すべて **gameplay PROVISIONAL** のチューニング値である。
 */
export const TRADE_STATUSES = ['tradable', 'unpriced', 'non_tradable', 'unverified'] as const
export type TradeStatus = (typeof TRADE_STATUSES)[number]

export type SpeciesTradeProfile = {
  readonly speciesId: FishSpeciesId
  readonly tradeStatus: TradeStatus
  /** tradeStatus が 'tradable' のときだけ意味を持つ。 */
  readonly baseYenPerKg: number
  readonly minimumUnitValueYen: number
  /** condition への価格感度（0〜1程度）。 */
  readonly qualitySensitivity: number
  /** サイズ百分位への価格感度（0〜1程度）。 */
  readonly sizeSensitivity: number
}
