import { z } from 'zod'
import { asFishingSpotId, asRegionId, asRegulationId } from '../../domain/ids'
import { accessRequirementSchema } from './accessRequirement'
import { currentProfileSchema, depthProfileSchema } from './profiles'
import { fishOccurrenceSchema } from './fishOccurrence'
import { nonEmptyString } from './primitives'
import { sourceRefsSchema } from './sourceRef'

/** SpotKnowledgeConfig。GAME_DESIGN.md §10 の最小表現（PROVISIONAL）。 */
export const spotKnowledgeConfigSchema = z.strictObject({
  reveals: z.array(
    z.strictObject({
      field: nonEmptyString,
      minKnowledge: z.number().min(0).max(100),
    }),
  ),
})

/** FishingSpot。DATA_MODEL.md §6 に対応する。 */
export const fishingSpotSchema = z.strictObject({
  id: nonEmptyString.transform(asFishingSpotId),
  name: nonEmptyString,
  regionId: nonEmptyString.transform(asRegionId),

  environment: nonEmptyString,

  access: z.array(accessRequirementSchema),

  habitatTags: z.array(nonEmptyString),

  depth: depthProfileSchema.optional(),
  current: currentProfileSchema.optional(),

  fishTable: z.array(fishOccurrenceSchema),

  regulations: z.array(nonEmptyString.transform(asRegulationId)).optional(),

  knowledgeConfig: spotKnowledgeConfigSchema,

  sourceRefs: sourceRefsSchema.optional(),
})
