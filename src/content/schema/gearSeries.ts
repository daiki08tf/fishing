import { z } from 'zod'
import { asBrandId } from '../../domain/ids'
import { GEAR_CATEGORIES } from '../../domain/gear/Gear'
import { GEAR_SERIES_TIERS } from '../../domain/gear/GearSeries'
import { nonEmptyString } from './primitives'

/**
 * Product Series（Brand → Series → Model）。
 * Series は整理・UI の概念であり、FishingEngine は知らない。
 */
export const gearSeriesSchema = z.strictObject({
  id: nonEmptyString,
  brandId: nonEmptyString.transform(asBrandId),
  name: nonEmptyString,
  category: z.enum(GEAR_CATEGORIES),
  tier: z.enum(GEAR_SERIES_TIERS),
  description: nonEmptyString,
})
