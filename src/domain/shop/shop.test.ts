import { describe, expect, it } from 'vitest'
import { createInitialFinanceState, DEFAULT_ECONOMY_TUNING } from '../economy/FinanceState'
import { asShopItemId } from '../ids'
import type { WorldTime } from '../world/WorldTime'
import type { ShopItem } from './ShopItem'
import { ownsItem } from './ShopItem'
import { purchaseShopItem } from './purchase'

const at: WorldTime = { year: 2026, month: 5, day: 4, hour: 12, minute: 0 }

const car: ShopItem = {
  id: asShopItemId('used-compact-car'),
  name: '中古コンパクトカー',
  description: '車',
  price: 450_000,
  category: 'vehicle',
  grantsTransport: 'car',
}

const buy = (cash: number, owned: readonly ReturnType<typeof asShopItemId>[] = []) =>
  purchaseShopItem({
    finance: { ...createInitialFinanceState(), cash },
    ownedItemIds: owned,
    item: car,
    at,
    atLabel: '2026-05-04 (月) 12:00',
  })

describe('shop', () => {
  it('fails when the player cannot afford it', () => {
    const result = buy(DEFAULT_ECONOMY_TUNING.initialCash)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('insufficient_cash')
      expect(result.message).toContain('¥450,000')
    }
  })

  it('deducts the price and records the ownership', () => {
    const result = buy(500_000)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.finance.cash).toBe(50_000)
    expect(result.grantedTransport).toBe('car')
    expect(ownsItem(result.ownedItemIds, car.id)).toBe(true)
    expect(result.finance.transactions[0]?.kind).toBe('purchase')
    expect(result.finance.transactions[0]?.amount).toBe(-450_000)
  })

  it('cannot be bought twice', () => {
    const first = buy(900_000)

    if (!first.ok) {
      throw new Error(first.message)
    }

    const second = purchaseShopItem({
      finance: first.finance,
      ownedItemIds: first.ownedItemIds,
      item: car,
      at,
      atLabel: '2026-05-04 (月) 12:00',
    })

    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.reason).toBe('already_owned')
    }
  })

  it('does not change the shop item definition', () => {
    // 商品は Content のデータ。購入しても定義そのものは変わらない。
    const before = { ...car }
    buy(900_000)

    expect(car).toEqual(before)
  })
})
