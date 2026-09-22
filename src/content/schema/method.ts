import { z } from 'zod'
import { PRESENTATION_MODES, REQUIRED_OFFERING_KINDS } from '../../domain/method/FishingMethod'
import { FISHING_PLATFORMS } from '../../domain/depth'
import { nonEmptyString } from './primitives'

/** Phase 17B: 提示方式。省略可（省略時は cast・Platform 制限なし）。 */
const presentationSchema = z.strictObject({
  mode: z.enum(PRESENTATION_MODES),
  supportedPlatforms: z.array(z.enum(FISHING_PLATFORMS)),
})

/** 釣法。Phase 6 で導入。 */
export const methodSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  requiresOffering: z.enum(REQUIRED_OFFERING_KINDS),
  offeringTags: z.array(nonEmptyString),
  presentation: presentationSchema.optional(),
})
