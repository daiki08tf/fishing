import { z } from 'zod'

/**
 * コンディション（体格差）の設定。省略時は Domain の既定値を使う。
 */
export const conditionModelSchema = z.strictObject({
  variability: z.number().min(0).max(1),
})
