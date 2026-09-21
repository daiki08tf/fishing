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
import { speciesEnvironmentAffinitySchema } from './environmentAffinity'
import { feedingProfileSchema } from './feedingProfile'

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

  /** PROVISIONAL — 釣法・offering との相性（1 が標準）。 */
  methodAffinity: z.record(z.string(), z.number().nonnegative()).optional(),
  offeringAffinity: z.record(z.string(), z.number().nonnegative()).optional(),

  /** Phase 9: 環境（季節 / 時間帯 / 天候 / 潮 / 流れ / 水温）の嗜好。未設定は neutral。 */
  environmentAffinity: speciesEnvironmentAffinitySchema.optional(),

  /** Phase 9.1: 捕食プロファイル（ルアーサイズの物理適合）。 */
  feedingProfile: feedingProfileSchema.optional(),

  lengthModel: lengthDistributionSchema,
  // Phase 2 で必須にした。体重は体長から導出する（独立した乱数にしない）。
  weightModel: weightModelSchema,
  conditionModel: conditionModelSchema.optional(),
  traitConfiguration: traitConfigurationSchema.optional(),
  fightProfile: fightProfileSchema,

  rarity: z.number().nonnegative(),

  sourceRefs: sourceRefsSchema.optional(),
})
