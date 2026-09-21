import { z } from 'zod'
import { asFishSpeciesId, asRegionId } from '../../domain/ids'
import {
  habitatTypeSchema,
  currentProfileSchema,
  fightProfileSchema,
  seasonalProfileSchema,
  tideProfileSchema,
  timeProfileSchema,
} from './profiles'
import { conditionModelSchema } from './conditionModel'
import { lengthDistributionSchema } from './lengthModel'
import { nonEmptyString, rangeSchema, waterTypeSchema } from './primitives'
import { sourceRefsSchema } from './sourceRef'
import { traitConfigurationSchema } from './traitConfiguration'
import { weightModelSchema } from './weightModel'

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
  // Phase 2 で必須にした。体重は体長から導出する（独立した乱数にしない）。
  weightModel: weightModelSchema,
  conditionModel: conditionModelSchema.optional(),
  traitConfiguration: traitConfigurationSchema.optional(),
  fightProfile: fightProfileSchema,

  rarity: z.number().nonnegative(),

  sourceRefs: sourceRefsSchema.optional(),
})
