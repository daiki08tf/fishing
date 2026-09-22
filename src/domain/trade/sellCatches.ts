import { earnCash, formatYen, type FinanceState } from '../economy'
import type { FishIndividualId, RegionId } from '../ids'
import { formatWorldTime, type WorldTime } from '../world/WorldTime'
import type { BuyerDefinition } from './Buyer'
import { removeKeptCatches, type FishBoxState } from './FishBox'
import { quoteSale, type SaleQuoteLine } from './quoteSale'
import type { SpeciesTradeProfile } from './SpeciesTradeProfile'
import { trustOf, type TradeState } from './TradeState'

/**
 * 選んだ Fish Box の中身を 1 つの買取先へまとめて売る。
 *
 * - **現在いる地域の買取先にしか売れない**（`buyer_region_mismatch`）。
 *   魚は基本的に「今いる地域の店 / 卸 / 市場へ持ち込む」ものであり、
 *   世界中の買取先へ瞬間売却できてはいけない。UI だけに任せず Domain で拒否する。
 * - 金額は `quoteSale`（UI プレビューと同じ関数）で解決する。
 *   プレビューと実際の受け取り額が構造的にズレない。
 * - 取引不可（tradeStatus !== 'tradable'）な種は除外し、理由を返す（黙って弾かない）。
 * - 同じ catch は 1 回しか売れない（Fish Box から消えるため物理的に二重売却できない）。
 * - Trust の付与は catch 単位ではなく **取引単位**（クリップされる）。
 *   返すのは「計算上の上昇量」ではなく **実際に state へ入った差分**
 *   （`trustAfter - trustBefore`）。Trust 100 では 0 になる。
 * - 価格・Trust とも deterministic（RNG を使わない）。
 */

export type SaleLine = SaleQuoteLine

export type SellCatchesResult =
  | {
      readonly ok: true
      readonly fishBox: FishBoxState
      readonly finance: FinanceState
      readonly trade: TradeState
      readonly totalValueYen: number
      /** 実際に state へ入った Trust の増分（0〜maxPerTransaction）。 */
      readonly actualTrustGain: number
      readonly trustBefore: number
      readonly trustAfter: number
      /** 除外された catch（取引不可・profile 未定義）と、その理由の内訳。 */
      readonly lines: readonly SaleLine[]
      readonly excludedCatchIds: readonly FishIndividualId[]
    }
  | {
      readonly ok: false
      readonly reason: 'no_catches_selected' | 'buyer_region_mismatch'
    }

export type SellCatchesInput = {
  readonly fishBox: FishBoxState
  readonly finance: FinanceState
  readonly trade: TradeState
  readonly buyer: BuyerDefinition
  /** 今いる地域（world.currentRegionId）。Buyer の地域と一致しなければ失敗する。 */
  readonly currentRegionId: RegionId
  readonly catchIds: readonly FishIndividualId[]
  readonly tradeProfileBySpeciesId: Readonly<Record<string, SpeciesTradeProfile>>
  readonly now: WorldTime
  readonly storageModifier?: number
}

export const sellCatches = (input: SellCatchesInput): SellCatchesResult => {
  /*
   * Phase 13.1 Domain 強制: 現在地域の買取先にしか売れない。
   * UI の出し分けだけを防壁にしないため、Domain の入口で必ず確認する。
   */
  if (String(input.buyer.regionId) !== String(input.currentRegionId)) {
    return { ok: false, reason: 'buyer_region_mismatch' }
  }

  const quote = quoteSale({
    fishBox: input.fishBox,
    catchIds: input.catchIds,
    buyer: input.buyer,
    tradeProfileBySpeciesId: input.tradeProfileBySpeciesId,
    now: input.now,
    ...(input.storageModifier === undefined ? {} : { storageModifier: input.storageModifier }),
  })

  if (quote.lines.length === 0) {
    return { ok: false, reason: 'no_catches_selected' }
  }

  const trustBefore = trustOf(input.trade, input.buyer.id)
  const requestedTrustGain = Math.min(
    input.buyer.trustProfile.maxPerTransaction,
    Math.round(
      input.buyer.trustProfile.perTransactionBase +
        input.buyer.trustProfile.qualityWeight * quote.averageQuality,
    ),
  )
  const trustAfter = Math.min(100, trustBefore + requestedTrustGain)
  // 100 付近で「計算上 +5 なのに実際は +0」という食い違いを返さない。
  const actualTrustGain = trustAfter - trustBefore

  const finance = earnCash(input.finance, {
    kind: 'trade',
    amount: quote.totalValueYen,
    label: `${input.buyer.name} へ ${String(quote.soldCatchIds.length)} 匹売却`,
    at: formatWorldTime(input.now),
  })

  const contactKey = String(input.buyer.id)
  /*
   * 売った魚は Fish Box から消える。
   * `TradeState.fishBox` と戻り値の `fishBox` は同じ配列にしておくこと
   * （Store は `trade` を保存するため、ここが食い違うと売った魚が復活する）。
   */
  const nextFishBox = removeKeptCatches(input.fishBox, quote.soldCatchIds)
  const trade: TradeState = {
    ...input.trade,
    fishBox: nextFishBox,
    contactTrust: { ...input.trade.contactTrust, [contactKey]: trustAfter },
  }

  return {
    ok: true,
    fishBox: nextFishBox,
    finance,
    trade,
    totalValueYen: quote.totalValueYen,
    actualTrustGain,
    trustBefore,
    trustAfter,
    lines: quote.lines,
    excludedCatchIds: quote.excluded.map((entry) => entry.catchId),
  }
}

export const describeSaleValue = (amount: number): string => formatYen(amount)
