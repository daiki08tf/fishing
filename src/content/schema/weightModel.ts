import { z } from 'zod'

/** 体長-体重関係 W = a * L^b。データ由来の係数をそのまま持つ。 */
export const weightModelSchema = z.strictObject({
  lengthWeightA: z.number().positive(),
  lengthWeightB: z.number().positive(),
})
