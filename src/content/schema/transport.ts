import { z } from 'zod'
import { asTransportId } from '../../domain/ids'
import { nonEmptyString } from './primitives'

/** Transport。DATA_MODEL.md §9 に対応する。 */
export const transportTypeSchema = z.enum([
  'walk',
  'train',
  'bus',
  'bicycle',
  'motorcycle',
  'car',
  'suv',
  'kayak',
  'trailer_boat',
  'boat',
])

export const transportSchema = z.strictObject({
  id: nonEmptyString.transform(asTransportId),
  name: nonEmptyString,
  type: transportTypeSchema,

  purchaseCost: z.number().nonnegative().optional(),
  runningCost: z.number().nonnegative().optional(),

  cargoCapacity: z.number().nonnegative(),
  range: z.number().positive().optional(),

  accessTags: z.array(nonEmptyString),
})
