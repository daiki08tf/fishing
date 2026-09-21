import { z } from 'zod'
import {
  SEASONS,
  TIDES,
  TIME_OF_DAY,
  WATER_FLOWS,
  WEATHERS,
} from '../../domain/environment/Environment'

/**
 * 魚種ごとの環境嗜好（Phase 9）。PROVISIONAL。
 *
 * すべて省略可能で、未設定は 1（neutral）として扱う。
 * 生物学的な事実ではなく、ゲームとしての傾向を表す。
 */
export const speciesEnvironmentAffinitySchema = z.strictObject({
  preferredSeasons: z.array(z.enum(SEASONS)).optional(),
  preferredTimeOfDay: z.array(z.enum(TIME_OF_DAY)).optional(),
  weatherAffinity: z.record(z.enum(WEATHERS), z.number().nonnegative()).optional(),
  tideAffinity: z.record(z.enum(TIDES), z.number().nonnegative()).optional(),
  flowAffinity: z.record(z.enum(WATER_FLOWS), z.number().nonnegative()).optional(),
  preferredTemperatureC: z
    .strictObject({
      min: z.number(),
      max: z.number(),
    })
    .refine((range) => range.min <= range.max, {
      message: 'preferredTemperatureC.min must be <= max',
      path: ['min'],
    })
    .optional(),
})
