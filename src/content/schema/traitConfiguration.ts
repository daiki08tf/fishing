import { z } from 'zod'

/**
 * 魚種ごとの Trait 抽選設定。すべて省略可能で、
 * 省略した項目は Domain の既定値（PROVISIONAL）を使う。
 */
export const traitConfigurationSchema = z.strictObject({
  trophyPercentileThreshold: z.number().min(0).max(100).optional(),
  oldChance: z.number().min(0).max(1).optional(),
  scarredChance: z.number().min(0).max(1).optional(),
  aggressiveChance: z.number().min(0).max(1).optional(),
  strongRunnerChance: z.number().min(0).max(1).optional(),
  heavyWeightRatioThreshold: z.number().positive().optional(),
})
