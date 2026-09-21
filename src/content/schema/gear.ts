import { z } from 'zod'
import { asGearId } from '../../domain/ids'
import {
  BAIT_TYPES,
  HOOK_TYPES,
  LINE_TYPES,
  LURE_TYPES,
  REEL_TYPES,
  ROD_ACTIONS,
  ROD_POWERS,
} from '../../domain/gear/Gear'
import { nonEmptyString } from './primitives'

/**
 * Gear の Content Schema。
 *
 * 現実由来の属性（長さ・重量域・ドラッグ力など）を検証する。
 * ゲーム調整値（係数）は GearTuning 側にあり、ここには無い。
 */

const id = nonEmptyString.transform(asGearId)
const price = z.number().int().nonnegative()
const base = { id, name: nonEmptyString, price }

export const rodSchema = z
  .strictObject({
    ...base,
    category: z.literal('rod'),
    lengthM: z.number().positive(),
    power: z.enum(ROD_POWERS),
    action: z.enum(ROD_ACTIONS),
    minLureWeightG: z.number().nonnegative(),
    maxLureWeightG: z.number().positive(),
    recommendedLineMinKg: z.number().positive(),
    recommendedLineMaxKg: z.number().positive(),
    weightG: z.number().positive(),
    sensitivity: z.number().min(0).max(1),
    control: z.number().min(0).max(1),
    fightingPower: z.number().min(0).max(1),
    castingProfile: z.number().min(0).max(1),
  })
  .refine((rod) => rod.minLureWeightG <= rod.maxLureWeightG, {
    message: 'minLureWeightG must be <= maxLureWeightG',
    path: ['minLureWeightG'],
  })
  .refine((rod) => rod.recommendedLineMinKg <= rod.recommendedLineMaxKg, {
    message: 'recommendedLineMinKg must be <= recommendedLineMaxKg',
    path: ['recommendedLineMinKg'],
  })

export const reelSchema = z.strictObject({
  ...base,
  category: z.literal('reel'),
  reelType: z.enum(REEL_TYPES),
  size: z.number().positive(),
  gearRatio: z.number().positive(),
  maxDragKg: z.number().positive(),
  lineCapacity: z
    .array(
      z.strictObject({
        lineStrengthKg: z.number().positive(),
        capacityM: z.number().positive(),
      }),
    )
    .min(1),
  retrieveCmPerTurn: z.number().positive(),
  weightG: z.number().positive(),
  smoothness: z.number().min(0).max(1),
  control: z.number().min(0).max(1),
})

export const lineSchema = z.strictObject({
  ...base,
  category: z.literal('line'),
  lineType: z.enum(LINE_TYPES),
  strengthKg: z.number().positive(),
  diameterMm: z.number().positive(),
  stretch: z.number().min(0).max(1),
  abrasionResistance: z.number().min(0).max(1),
  visibility: z.number().min(0).max(1),
  sensitivity: z.number().min(0).max(1),
})

export const leaderSchema = z.strictObject({
  ...base,
  category: z.literal('leader'),
  material: nonEmptyString,
  strengthKg: z.number().positive(),
  diameterMm: z.number().positive(),
  abrasionResistance: z.number().min(0).max(1),
  visibility: z.number().min(0).max(1),
  lengthM: z.number().positive(),
})

export const hookSchema = z.strictObject({
  ...base,
  category: z.literal('hook'),
  size: z.number().positive(),
  strengthKg: z.number().positive(),
  hookType: z.enum(HOOK_TYPES),
  penetration: z.number().min(0).max(1),
  holdingPower: z.number().min(0).max(1),
})

export const lureSchema = z.strictObject({
  ...base,
  category: z.literal('lure'),
  lureType: z.enum(LURE_TYPES),
  weightG: z.number().positive(),
  lengthMm: z.number().positive(),
  depthRangeM: z
    .strictObject({ min: z.number().nonnegative(), max: z.number().positive() })
    .refine((range) => range.min <= range.max, {
      message: 'depthRangeM.min must be <= max',
      path: ['min'],
    }),
  retrieveStyle: nonEmptyString,
  action: nonEmptyString,
  visualProfile: nonEmptyString,
  targetProfile: z.array(nonEmptyString),
})

export const baitSchema = z.strictObject({
  ...base,
  category: z.literal('bait'),
  baitType: z.enum(BAIT_TYPES),
  presentation: nonEmptyString,
  targetProfile: z.array(nonEmptyString),
})

/** カテゴリで判別する union。 */
export const gearItemSchema = z.union([
  rodSchema,
  reelSchema,
  lineSchema,
  leaderSchema,
  hookSchema,
  lureSchema,
  baitSchema,
])
