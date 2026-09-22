import { z } from 'zod'
import { asFishSpeciesId } from '../../domain/ids'
import { TRADE_STATUSES } from '../../domain/trade/SpeciesTradeProfile'
import { TRADE_TAGS } from '../../domain/trade/TradeTag'
import { nonEmptyString } from './primitives'

/**
 * SpeciesTradeProfile（Phase 13）。
 *
 * 生物データ（FishSpecies.rarity）と経済データを分離するための別 Content。
 * 全 runtime Species は tradable / unpriced / non_tradable / unverified の
 * いずれかを明示する（`validate:content` が未指定を検出する）。すべて PROVISIONAL。
 */
export const speciesTradeProfileSchema = z.strictObject({
  speciesId: nonEmptyString.transform(asFishSpeciesId),
  tradeStatus: z.enum(TRADE_STATUSES),
  /**
   * Phase 13.1: 魚種の取引上の性格。Buyer の preferredTags / neutralTags と
   * 突き合わせて価格の相性を解決する（魚種 ID 分岐を書かないための語彙）。
   */
  tradeTags: z.array(z.enum(TRADE_TAGS)).min(1),
  baseYenPerKg: z.number().nonnegative(),
  minimumUnitValueYen: z.number().int().nonnegative(),
  qualitySensitivity: z.number().min(0).max(2),
  sizeSensitivity: z.number().min(0).max(2),
})
