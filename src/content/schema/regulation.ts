import { z } from 'zod'
import { asFishSpeciesId, asFishingSpotId, asRegionId, asRegulationId } from '../../domain/ids'
import { isoDateSchema, monthSchema, nonEmptyString } from './primitives'
import { sourceRefsSchema } from './sourceRef'

/** Regulation。DATA_MODEL.md §14 に対応する。 */
export const regulationTypeSchema = z.enum([
  'permit',
  'closed_season',
  'closed_area',
  'size_limit',
  'bag_limit',
  'method_restriction',
])

export const regulationSchema = z.strictObject({
  id: nonEmptyString.transform(asRegulationId),
  type: regulationTypeSchema,

  regionId: nonEmptyString.transform(asRegionId).optional(),
  spotId: nonEmptyString.transform(asFishingSpotId).optional(),
  speciesId: nonEmptyString.transform(asFishSpeciesId).optional(),

  /** PROVISIONAL — size_limit / bag_limit の制限値。 */
  value: z.number().nonnegative().optional(),

  /** PROVISIONAL — closed_season の対象月。 */
  months: z.array(monthSchema).optional(),

  validFrom: isoDateSchema.optional(),
  validTo: isoDateSchema.optional(),

  sourceRefs: sourceRefsSchema,
})
