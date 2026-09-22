import { earnCash, formatYen, type FinanceState } from '../economy'
import type { FishIndividualId } from '../ids'
import { formatWorldTime, type WorldTime } from '../world/WorldTime'
import type { BuyerDefinition } from './Buyer'
import { removeKeptCatches, type FishBoxState, type KeptCatch } from './FishBox'
import { DEFAULT_STORAGE_MODIFIER, resolveFreshness } from './Freshness'
import type { SpeciesTradeProfile } from './SpeciesTradeProfile'
import { calcSaleValueYen, resolveCatchQuality } from './tradeValue'
import { trustOf, type TradeState } from './TradeState'

/**
 * 選んだ Fish Box の中身を 1 つの買取先へまとめて売る。
 *
 * - 取引不可（tradeStatus !== 'tradable'）な種は除外し、理由を返す（黙って弾かない）。
 * - 同じ catch は 1 回しか売れない（Fish Box から消えるため物理的に二重売却できない）。
 * - Trust の付与は catch 単位ではなく **取引単位**（クリップされる）。
 * - 価格・Trust とも deterministic（RNG を使わない）。
 */

export type SaleLine = {
  readonly catchId: FishIndividualId
  readonly speciesId: string
  readonly valueYen: number
}

export type SellCatchesResult =
  | {
      readonly ok: true
      readonly fishBox: FishBoxState
      readonly finance: FinanceState
      readonly trade: TradeState
      readonly totalValueYen: number
      readonly trustGain: number
      readonly lines: readonly SaleLine[]
      readonly excludedCatchIds: readonly FishIndividualId[]
    }
  | { readonly ok: false; readonly reason: 'no_catches_selected' | 'buyer_region_mismatch' }

export type SellCatchesInput = {
  readonly fishBox: FishBoxState
  readonly finance: FinanceState
  readonly trade: TradeState
  readonly buyer: BuyerDefinition
  readonly catchIds: readonly FishIndividualId[]
  readonly tradeProfileBySpeciesId: Readonly<Record<string, SpeciesTradeProfile>>
  readonly now: WorldTime
  readonly storageModifier?: number
}

export const sellCatches = (input: SellCatchesInput): SellCatchesResult => {
  const selected = input.fishBox.filter((entry) => input.catchIds.includes(entry.catchId))

  if (selected.length === 0) {
    return { ok: false, reason: 'no_catches_selected' }
  }

  const storageModifier = input.storageModifier ?? DEFAULT_STORAGE_MODIFIER
  const lines: SaleLine[] = []
  const excludedCatchIds: FishIndividualId[] = []
  const qualityScores: number[] = []
  let totalValueYen = 0
  const soldCatchIds: FishIndividualId[] = []

  selected.forEach((entry: KeptCatch, index: number) => {
    const profile = input.tradeProfileBySpeciesId[String(entry.speciesId)]

    if (profile === undefined || profile.tradeStatus !== 'tradable') {
      excludedCatchIds.push(entry.catchId)
      return
    }

    const freshness = resolveFreshness(entry.caughtAt, input.now, storageModifier)
    const valueYen = calcSaleValueYen(entry, input.buyer, profile, freshness)
    const quality = resolveCatchQuality(entry, input.buyer, profile, freshness)
    const volumeBonus = Math.min(
      input.buyer.pricingProfile.maxVolumeBonus,
      input.buyer.pricingProfile.volumeBonusPerExtraCatch * index,
    )

    totalValueYen += Math.round(valueYen * (1 + volumeBonus))
    qualityScores.push(quality.score)
    lines.push({ catchId: entry.catchId, speciesId: String(entry.speciesId), valueYen })
    soldCatchIds.push(entry.catchId)
  })

  if (soldCatchIds.length === 0) {
    return { ok: false, reason: 'no_catches_selected' }
  }

  const averageQuality = qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length
  const trustGain = Math.min(
    input.buyer.trustProfile.maxPerTransaction,
    Math.round(
      input.buyer.trustProfile.perTransactionBase +
        input.buyer.trustProfile.qualityWeight * averageQuality,
    ),
  )

  const finance = earnCash(input.finance, {
    kind: 'trade',
    amount: totalValueYen,
    label: `${input.buyer.name} へ ${String(soldCatchIds.length)} 匹売却`,
    at: formatWorldTime(input.now),
  })

  const contactKey = String(input.buyer.id)
  const nextTrust = Math.min(100, trustOf(input.trade, input.buyer.id) + trustGain)
  const trade: TradeState = {
    ...input.trade,
    contactTrust: { ...input.trade.contactTrust, [contactKey]: nextTrust },
  }

  return {
    ok: true,
    fishBox: removeKeptCatches(input.fishBox, soldCatchIds),
    finance,
    trade,
    totalValueYen,
    trustGain,
    lines,
    excludedCatchIds,
  }
}

export const describeSaleValue = (amount: number): string => formatYen(amount)
