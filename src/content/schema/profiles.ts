import { z } from 'zod'
import { dayPeriodSchema, monthSchema, rangeSchema } from './primitives'

/**
 * PROVISIONAL — 設計文書で名前のみ定義されている概念の最小スキーマ。
 * 対応する Domain 型は src/domain/fish/profiles.ts。
 */

export const habitatTypeSchema = z.string().min(1)

export const lengthDistributionSchema = z
  .strictObject({
    meanCm: z.number().positive(),
    standardDeviationCm: z.number().nonnegative(),
    minCm: z.number().positive(),
    maxCm: z.number().positive(),
  })
  .refine((model) => model.minCm <= model.meanCm, {
    message: 'minCm must be less than or equal to meanCm',
    path: ['minCm'],
  })
  .refine((model) => model.meanCm <= model.maxCm, {
    message: 'meanCm must be less than or equal to maxCm',
    path: ['meanCm'],
  })

export const weightModelSchema = z.strictObject({
  lengthWeightA: z.number().positive(),
  lengthWeightB: z.number().positive(),
})

export const fightProfileSchema = z.strictObject({
  strength: z.number().min(0).max(1),
  stamina: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
})

export const seasonalProfileSchema = z.strictObject({
  months: z.array(monthSchema),
})

export const timeProfileSchema = z.strictObject({
  periods: z.array(dayPeriodSchema),
})

export const tideProfileSchema = z.strictObject({
  preference: z.enum(['low', 'rising', 'high', 'falling', 'any']),
})

export const currentProfileSchema = z.strictObject({
  preference: z.enum(['none', 'slow', 'moderate', 'strong', 'any']),
})

export const depthProfileSchema = z.strictObject({
  depthRangeM: rangeSchema,
})
