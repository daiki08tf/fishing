import { z } from 'zod'
import { asGearId, asShopItemId } from '../../domain/ids'
import { SHOP_CATEGORIES } from '../../domain/shop/ShopItem'
import { nonEmptyString } from './primitives'
import { transportTypeSchema } from './transport'

/** Shop の商品。Content で定義し、Engine の if 文を増やさない。 */
export const shopItemSchema = z.strictObject({
  id: nonEmptyString.transform(asShopItemId),
  name: nonEmptyString,
  description: nonEmptyString,
  /** 円単位。 */
  price: z.number().int().positive(),
  category: z.enum(SHOP_CATEGORIES),
  grantsTransport: transportTypeSchema.optional(),
  /**
   * 購入すると所持 Inventory へ入る Gear。
   * 「1 商品 = 1 セット」のような束ね売りを表現できる（通常の Gear 単品は
   * `gear` Content から直接買えるため、ここには書かなくてよい）。
   */
  grantsGearId: nonEmptyString.transform(asGearId).optional(),
})
