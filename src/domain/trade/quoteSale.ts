import type { FishIndividualId } from '../ids'
import type { WorldTime } from '../world/WorldTime'
import type { BuyerDefinition } from './Buyer'
import type { FishBoxState, KeptCatch } from './FishBox'
import { DEFAULT_STORAGE_MODIFIER, resolveFreshness } from './Freshness'
import type { SpeciesTradeProfile } from './SpeciesTradeProfile'
import { calcSaleValueYen, resolveCatchQuality } from './tradeValue'

/**
 * 売却見積り（Phase 13.1）。
 *
 * **Trade 画面のプレビューと実際の売却は必ずこの 1 つの pure function を通す。**
 * 以前は UI 側が `calcSaleValueYen` を直接呼んでいたため、volume bonus の分だけ
 * プレビューと実際の受け取り額がズレていた。
 *
 * 決定論的（RNG なし）。金額はすべて円単位の整数。
 *
 * 不変条件:
 * - `sum(lines.valueYen) === totalValueYen`（= 実際に加算される額）
 * - volume bonus は **tradable と確定した魚の配列** に対してだけ計算する
 *   （取引不可の魚が何匹混ざっていても、その位置で bonus は変わらない）
 * - 同じ集合・同じ買取先なら、魚の並び順を変えても合計額は変わらない
 *   （bonus は「tradable の匹数」だけで決まり、各 line に同じ倍率が掛かる）
 */

export type SaleQuoteExcludedReason = 'unknown_trade_profile' | 'not_tradable'

export type SaleQuoteLine = {
  readonly catchId: FishIndividualId
  readonly speciesId: string
  /** 0〜1。鮮度そのもの（表示・検算用）。 */
  readonly freshness: number
  /** volume bonus を掛ける前の査定額。 */
  readonly baseValueYen: number
  /** この line に掛かった volume bonus（0〜maxVolumeBonus）。 */
  readonly volumeBonus: number
  /** **実際に加算される最終額**（bonus 込み）。 */
  readonly valueYen: number
}

export type SaleQuoteExcluded = {
  readonly catchId: FishIndividualId
  readonly speciesId: string
  readonly reason: SaleQuoteExcludedReason
}

export type SaleQuote = {
  readonly lines: readonly SaleQuoteLine[]
  readonly excluded: readonly SaleQuoteExcluded[]
  /** 実際に売れる catch（Fish Box から消える）。 */
  readonly soldCatchIds: readonly FishIndividualId[]
  readonly totalValueYen: number
  /** tradable と確定した匹数（0 or 1 なら bonus は 0）。 */
  readonly tradableCount: number
  /** 全 line に共通で掛かった volume bonus。 */
  readonly volumeBonus: number
  /** Trust 計算に使う 0〜1 の平均 quality（tradable が無ければ 0）。 */
  readonly averageQuality: number
}

export type QuoteSaleInput = {
  readonly fishBox: FishBoxState
  readonly catchIds: readonly FishIndividualId[]
  readonly buyer: BuyerDefinition
  readonly tradeProfileBySpeciesId: Readonly<Record<string, SpeciesTradeProfile>>
  readonly now: WorldTime
  readonly storageModifier?: number
}

type TradableEntry = {
  readonly entry: KeptCatch
  readonly profile: SpeciesTradeProfile
  readonly freshness: number
  readonly baseValueYen: number
  readonly qualityScore: number
}

export const quoteSale = (input: QuoteSaleInput): SaleQuote => {
  const storageModifier = input.storageModifier ?? DEFAULT_STORAGE_MODIFIER
  const selected = input.fishBox.filter((entry) => input.catchIds.includes(entry.catchId))
  const tradable: TradableEntry[] = []
  const excluded: SaleQuoteExcluded[] = []

  for (const entry of selected) {
    const profile = input.tradeProfileBySpeciesId[String(entry.speciesId)]

    if (profile === undefined) {
      excluded.push({
        catchId: entry.catchId,
        speciesId: String(entry.speciesId),
        reason: 'unknown_trade_profile',
      })
      continue
    }

    if (profile.tradeStatus !== 'tradable') {
      excluded.push({
        catchId: entry.catchId,
        speciesId: String(entry.speciesId),
        reason: 'not_tradable',
      })
      continue
    }

    const freshness = resolveFreshness(entry.caughtAt, input.now, storageModifier)

    tradable.push({
      entry,
      profile,
      freshness,
      baseValueYen: calcSaleValueYen(entry, input.buyer, profile, freshness),
      qualityScore: resolveCatchQuality(entry, input.buyer, profile, freshness).score,
    })
  }

  /*
   * volume bonus は tradable が確定した **後** に、その匹数だけで決める。
   * 1 匹目には掛からないので `tradableCount - 1` 倍。
   */
  const volumeBonus =
    tradable.length <= 1
      ? 0
      : Math.min(
          input.buyer.pricingProfile.maxVolumeBonus,
          input.buyer.pricingProfile.volumeBonusPerExtraCatch * (tradable.length - 1),
        )

  const lines: SaleQuoteLine[] = tradable.map((item) => ({
    catchId: item.entry.catchId,
    speciesId: String(item.entry.speciesId),
    freshness: item.freshness,
    baseValueYen: item.baseValueYen,
    volumeBonus,
    // 同じ集合なら並び順に依存しない（各 line が独立に整数へ丸められる）。
    valueYen: Math.round(item.baseValueYen * (1 + volumeBonus)),
  }))
  const totalValueYen = lines.reduce((sum, line) => sum + line.valueYen, 0)
  const averageQuality =
    tradable.length === 0
      ? 0
      : tradable.reduce((sum, item) => sum + item.qualityScore, 0) / tradable.length

  return {
    lines,
    excluded,
    soldCatchIds: lines.map((line) => line.catchId),
    totalValueYen,
    tradableCount: tradable.length,
    volumeBonus,
    averageQuality,
  }
}
