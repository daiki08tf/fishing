import { z } from 'zod'
import { asAreaId, asCountryId, asRegionId } from '../../domain/ids'
import { REGION_STAGES, WORLD_DATA_STATUSES } from '../../domain/world/Region'
import { HEMISPHERES, WEATHERS } from '../../domain/environment/Environment'
import { nonEmptyString } from './primitives'

const areaSchema = z.strictObject({
  id: nonEmptyString.transform(asAreaId),
  name: nonEmptyString,
})

const baseSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  areaId: nonEmptyString.transform(asAreaId),
})

/**
 * 地域の気候プロファイル（Phase 9）。
 * 気象モデルではなく「地域ごとの傾向」だけを持つ（PROVISIONAL）。
 */
const climateSchema = z.strictObject({
  /** Phase 16 Part 2b: 季節の半球。省略時は 'north'（既存 Content はそのまま）。 */
  hemisphere: z.enum(HEMISPHERES).default('north'),
  annualMeanWaterC: z.number(),
  seasonalSwingC: z.number().nonnegative(),
  weatherWeights: z.record(z.enum(WEATHERS), z.number().nonnegative()),
  tidePhaseOffset: z.number().min(0).max(1),
  tideRange: z.enum(['small', 'moderate', 'large']),
})

/**
 * Region。Country → Region → Area → Spot の中間。
 *
 * `planned` は将来拡張用の地域定義（Spot / Expedition を持たない）。
 * World model が Alaska 専用でないことを確かめるために置いている。
 */
export const regionSchema = z
  .strictObject({
    id: nonEmptyString.transform(asRegionId),
    countryId: nonEmptyString.transform(asCountryId),
    name: nonEmptyString,
    stage: z.enum(REGION_STAGES),
    dataStatus: z.enum(WORLD_DATA_STATUSES),
    base: baseSchema,
    areas: z.array(areaSchema).min(1),
    climate: climateSchema,
  })
  .superRefine((region, context) => {
    if (!region.areas.some((area) => area.id === region.base.areaId)) {
      context.addIssue({
        code: 'custom',
        path: ['base', 'areaId'],
        message: 'base.areaId must be one of areas',
      })
    }
  })
