import { z } from 'zod'
import { asFishingSpotId, asRegionId, asRegulationId } from '../../domain/ids'
import { accessRequirementSchema } from './accessRequirement'
import { currentProfileSchema, depthProfileSchema } from './profiles'
import { fishOccurrenceSchema } from './fishOccurrence'
import { nonEmptyString } from './primitives'
import { sourceRefsSchema } from './sourceRef'
import { accessCapabilitySchema, routeFeatureSchema, transportTypeSchema } from './transport'
import { SPOT_DATA_STATUSES } from '../../domain/world/FishingSpot'

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
export const spotTravelOptionSchema = z.strictObject({
  id: nonEmptyString,
  transportTypes: z.array(transportTypeSchema).min(1),
  requiredCapabilities: z.array(accessCapabilitySchema),
  features: z.array(routeFeatureSchema),
  baseMinutes: z.number().positive(),
  distanceKm: z.number().nonnegative(),
  /** 片道の固定費（円）。 */
  baseOneWayCost: z.number().int().nonnegative(),
})

export const spotDataStatusSchema = z.enum(SPOT_DATA_STATUSES)

export const fishingSpotSchema = z.strictObject({
  id: nonEmptyString.transform(asFishingSpotId),
  name: nonEmptyString,
  regionId: nonEmptyString.transform(asRegionId),

  environment: nonEmptyString,

  access: z.array(accessRequirementSchema),

  travelOptions: z.array(spotTravelOptionSchema).min(1),

  /** データの信頼度。実在の釣り可否を根拠なく断定しないための表示。 */
  dataStatus: spotDataStatusSchema,

  habitatTags: z.array(nonEmptyString),

  depth: depthProfileSchema.optional(),
  current: currentProfileSchema.optional(),

  fishTable: z.array(fishOccurrenceSchema),

  regulations: z.array(nonEmptyString.transform(asRegulationId)).optional(),

  knowledgeConfig: spotKnowledgeConfigSchema,

  sourceRefs: sourceRefsSchema.optional(),
})
