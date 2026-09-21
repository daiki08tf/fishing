import { z } from 'zod'
import { asFishSpeciesId } from '../../domain/ids'
import { nonEmptyString, rangeSchema } from './primitives'
import { seasonalProfileSchema, tideProfileSchema, timeProfileSchema } from './profiles'

/** FishOccurrence。DATA_MODEL.md §7 に対応する。 */
export const fishOccurrenceSchema = z.strictObject({
  speciesId: nonEmptyString.transform(asFishSpeciesId),

  basePresence: z.number().nonnegative(),

  season: seasonalProfileSchema.optional(),
  time: timeProfileSchema.optional(),
  tide: tideProfileSchema.optional(),
  temperature: rangeSchema.optional(),

  preferredHabitats: z.array(nonEmptyString).optional(),

  sizeModifier: z.number().positive().optional(),
})
