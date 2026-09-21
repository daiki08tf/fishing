import { z } from 'zod'
import { asFishSpeciesId, asRegionId } from '../../domain/ids'
import {
  habitatTypeSchema,
  currentProfileSchema,
  fightProfileSchema,
  lengthDistributionSchema,
  seasonalProfileSchema,
  tideProfileSchema,
  timeProfileSchema,
  weightModelSchema,
} from './profiles'
import { nonEmptyString, rangeSchema, waterTypeSchema } from './primitives'
import { sourceRefsSchema } from './sourceRef'

/** FishSpecies。DATA_MODEL.md §2 に対応する。 */
export const fishSpeciesSchema = z.strictObject({
  id: nonEmptyString.transform(asFishSpeciesId),
  japaneseName: nonEmptyString,
  scientificName: nonEmptyString.optional(),

  taxonomy: z
    .strictObject({
      family: nonEmptyString.optional(),
      genus: nonEmptyString.optional(),
    })
    .optional(),

  waterTypes: z.array(waterTypeSchema).min(1),
  distribution: z.array(nonEmptyString.transform(asRegionId)),
  habitats: z.array(habitatTypeSchema),
  depthRange: rangeSchema.optional(),
  temperatureRange: rangeSchema.optional(),

  seasonality: seasonalProfileSchema.optional(),
  timeActivity: timeProfileSchema.optional(),
  tidePreference: tideProfileSchema.optional(),
  currentPreference: currentProfileSchema.optional(),

  diet: z.array(nonEmptyString).optional(),
  baits: z.array(nonEmptyString).optional(),
  lureCategories: z.array(nonEmptyString).optional(),
  fishingMethods: z.array(nonEmptyString).optional(),

  lengthModel: lengthDistributionSchema,
  weightModel: weightModelSchema.optional(),
  fightProfile: fightProfileSchema,

  rarity: z.number().nonnegative(),

  sourceRefs: sourceRefsSchema.optional(),
})
