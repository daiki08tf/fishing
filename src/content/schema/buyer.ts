import { z } from 'zod'
import { asContactId, asRegionId } from '../../domain/ids'
import { BUYER_TYPES } from '../../domain/trade/Buyer'
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
})
