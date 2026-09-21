import type { TransportType } from '../access/Transport'
import type { GearId, ShopItemId } from '../ids'

/**
 * Shop の商品。Phase 5 の目的は「Money → Asset → World Access」の証明である。
 *
 * 商品は Content で定義する。品揃えを増やすために Engine の if 文を増やさない
 * （Content を足せば Shop に並ぶ）。
 *
 * Phase 5 で扱うのは中古コンパクトカーだけ。車種スペック・ローン・保険・
 * 駐車場・車検・故障・ガソリン残量は扱わない。
 */

export const SHOP_CATEGORIES = ['vehicle', 'gear', 'other'] as const
export type ShopCategory = (typeof SHOP_CATEGORIES)[number]

export const SHOP_CATEGORY_LABELS: Readonly<Record<ShopCategory, string>> = {
  vehicle: '移動手段',
  gear: '装備',
  other: 'その他',
}

export type ShopItem = {
  readonly id: ShopItemId
  readonly name: string
  readonly description: string
  /** 円単位。 */
  readonly price: number
  readonly category: ShopCategory
  /** 購入すると使えるようになる移動手段。 */
  readonly grantsTransport?: TransportType
  /** 購入すると所持 Inventory へ入る Gear（束ね売り）。 */
  readonly grantsGearId?: GearId
}

export const ownsItem = (ownedItemIds: readonly ShopItemId[], itemId: ShopItemId): boolean =>
  ownedItemIds.includes(itemId)
