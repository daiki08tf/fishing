import { z } from 'zod'
import { REQUIRED_OFFERING_KINDS } from '../../domain/method/FishingMethod'
import { nonEmptyString } from './primitives'

/** 釣法。Phase 6 で導入。 */
export const methodSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  requiresOffering: z.enum(REQUIRED_OFFERING_KINDS),
  offeringTags: z.array(nonEmptyString),
})
