import { z } from 'zod'

/**
 * 体長分布のスキーマ。Domain 側の LengthDistribution と対応する。
 *
 * `kind` で判別する union。将来 `empirical`（実測データ）を足すときは、
 * ここに 1 メンバーを追加すればよい。
 */

const centimetres = z.number().positive()

export const normalLengthModelSchema = z
  .strictObject({
    kind: z.literal('normal'),
    meanCm: centimetres,
    standardDeviationCm: z.number().nonnegative(),
    minCm: centimetres,
    maxCm: centimetres,
  })
  .refine((model) => model.minCm <= model.meanCm, {
    message: 'minCm must be less than or equal to meanCm',
    path: ['minCm'],
  })
  .refine((model) => model.meanCm <= model.maxCm, {
    message: 'meanCm must be less than or equal to maxCm',
    path: ['meanCm'],
  })
  .refine((model) => model.minCm < model.maxCm, {
    message: 'minCm must be strictly less than maxCm',
    path: ['maxCm'],
  })

export const logNormalLengthModelSchema = z
  .strictObject({
    kind: z.literal('lognormal'),
    medianCm: centimetres,
    dispersion: z.number().positive().max(1),
    minCm: centimetres,
    maxCm: centimetres,
  })
  .refine((model) => model.minCm <= model.medianCm, {
    message: 'minCm must be less than or equal to medianCm',
    path: ['minCm'],
  })
  .refine((model) => model.medianCm <= model.maxCm, {
    message: 'medianCm must be less than or equal to maxCm',
    path: ['medianCm'],
  })
  .refine((model) => model.minCm < model.maxCm, {
    message: 'minCm must be strictly less than maxCm',
    path: ['maxCm'],
  })

/**
 * refine を含むスキーマ同士なので discriminatedUnion ではなく union を使う
 * （Zod の discriminatedUnion は判別子を持つ素の object を要求する）。
 */
export const lengthDistributionSchema = z.union([
  normalLengthModelSchema,
  logNormalLengthModelSchema,
])
