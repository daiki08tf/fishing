import { z } from 'zod'
import { asAreaId, asFishingSpotId, asRegionId, asRegulationId } from '../../domain/ids'
import { accessRequirementSchema } from './accessRequirement'
import { currentProfileSchema, depthProfileSchema } from './profiles'
import { fishOccurrenceSchema } from './fishOccurrence'
import { nonEmptyString, rangeSchema } from './primitives'
import { sourceRefsSchema } from './sourceRef'
import { accessCapabilitySchema, routeFeatureSchema, transportTypeSchema } from './transport'
import { SPOT_DATA_STATUSES, SPOT_VISIBILITIES } from '../../domain/world/FishingSpot'

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
export const spotVisibilitySchema = z.enum(SPOT_VISIBILITIES)

export const fishingZoneSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  castDistanceM: rangeSchema.optional(),
  depthRangeM: rangeSchema.optional(),
  habitatTags: z.array(nonEmptyString),
})

export const fishingSpotSchema = z.strictObject({
  id: nonEmptyString.transform(asFishingSpotId),
  name: nonEmptyString,
  regionId: nonEmptyString.transform(asRegionId),
  /** Phase 8: Region 内の Area。省略可（Area を持たない地域もある）。 */
  areaId: nonEmptyString.transform(asAreaId).optional(),

  environment: nonEmptyString,

  access: z.array(accessRequirementSchema),

  travelOptions: z.array(spotTravelOptionSchema).min(1),

  /** データの信頼度。実在の釣り可否を根拠なく断定しないための表示。 */
  dataStatus: spotDataStatusSchema,

  /** Phase 13: 省略時は 'public'。 */
  visibility: spotVisibilitySchema.optional(),

  habitatTags: z.array(nonEmptyString),

  depth: depthProfileSchema.optional(),
  current: currentProfileSchema.optional(),

  /** Phase 11: 未設定なら runtime が fallback Zone を 1 つ作る。 */
  fishingZones: z.array(fishingZoneSchema).min(1).optional(),

  fishTable: z.array(fishOccurrenceSchema),

  regulations: z.array(nonEmptyString.transform(asRegulationId)).optional(),

  knowledgeConfig: spotKnowledgeConfigSchema,

  sourceRefs: sourceRefsSchema.optional(),
})
