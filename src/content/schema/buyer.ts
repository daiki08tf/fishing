import { z } from 'zod'
import { asContactId, asRegionId } from '../../domain/ids'
import { BUYER_TYPES } from '../../domain/trade/Buyer'
import { TRADE_TAGS } from '../../domain/trade/TradeTag'
import { nonEmptyString } from './primitives'

/** Buyer（Phase 13）。Buyer は Contact の一種として同じ ID 空間（ContactId）を使う。 */
export const buyerSchema = z.strictObject({
  id: nonEmptyString.transform(asContactId),
  name: nonEmptyString,
  buyerType: z.enum(BUYER_TYPES),
  regionId: nonEmptyString.transform(asRegionId),
  description: nonEmptyString,
  pricingProfile: z.strictObject({
    baseMultiplier: z.number().positive(),
    qualitySensitivity: z.number().min(0),
    sizeSensitivity: z.number().min(0),
    freshnessSensitivity: z.number().min(0).max(1),
    volumeBonusPerExtraCatch: z.number().min(0),
    maxVolumeBonus: z.number().min(0),
  }),
  trustProfile: z.strictObject({
    perTransactionBase: z.number().min(0),
    qualityWeight: z.number().min(0),
    maxPerTransaction: z.number().int().positive(),
  }),
  /**
   * Phase 13.1: 魚種タグ（SpeciesTradeProfile.tradeTags）への好み。
   * 魚種 ID は持たない（speciesId 分岐を禁止する）。
   */
  preferences: z.strictObject({
    preferredTags: z.array(z.enum(TRADE_TAGS)),
    neutralTags: z.array(z.enum(TRADE_TAGS)),
    preferredTagMultiplier: z.number().positive(),
    neutralTagMultiplier: z.number().positive(),
    otherTagMultiplier: z.number().positive(),
    localSourceMultiplier: z.number().positive(),
  }),
})
