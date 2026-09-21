import type { FinanceState } from '../economy/FinanceState'
import { formatYen, spendCash } from '../economy/finance'
import type { GearId, ShopItemId, TransportId } from '../ids'
import type { WorldTime } from '../world/WorldTime'
import { ownsItem, type ShopItem } from './ShopItem'

/**
 * 買い物。残高が足りなければ失敗する（借金はしない）。
 *
 * ここは資金と所有物だけを扱う。
 * 移動手段として使えるようにするのは PlayerTransportState 側の仕事であり、
 * Economy から AccessEngine の状態を直接書き換えない。
 */

export type PurchaseFailure = 'insufficient_cash' | 'already_owned'

export type PurchaseResult =
  | {
      readonly ok: true
      readonly finance: FinanceState
      readonly ownedItemIds: readonly ShopItemId[]
      readonly grantedTransportId: TransportId | null
      /** 購入で手に入る Gear（束ね売り）。所持への追加は呼び出し側が行う。 */
      readonly grantedGearId: GearId | null
    }
  | { readonly ok: false; readonly reason: PurchaseFailure; readonly message: string }

export const purchaseShopItem = (options: {
  readonly finance: FinanceState
  readonly ownedItemIds: readonly ShopItemId[]
  readonly item: ShopItem
  readonly at: WorldTime
  readonly atLabel: string
}): PurchaseResult => {
  if (ownsItem(options.ownedItemIds, options.item.id)) {
    return { ok: false, reason: 'already_owned', message: 'すでに持っている' }
  }

  const paid = spendCash(options.finance, {
    kind: 'purchase',
    amount: options.item.price,
    label: `${options.item.name} の購入`,
    at: options.atLabel,
  })

  if (!paid.ok) {
    return {
      ok: false,
      reason: 'insufficient_cash',
      message: `${formatYen(options.item.price)} 必要（所持 ${formatYen(options.finance.cash)}）`,
    }
  }

  return {
    ok: true,
    finance: paid.finance,
    ownedItemIds: [...options.ownedItemIds, options.item.id],
    grantedTransportId: options.item.grantsTransportId ?? null,
    grantedGearId: options.item.grantsGearId ?? null,
  }
}
