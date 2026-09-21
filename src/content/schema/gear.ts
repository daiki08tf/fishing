import { z } from 'zod'
import { asBrandId, asGearId } from '../../domain/ids'
import {
  BAIT_TYPES,
  HOOK_TYPES,
  LINE_TYPES,
  LURE_TYPES,
  REEL_SIZE_CLASSES,
  REEL_TYPES,
  REEL_VARIANTS,
  ROD_ACTIONS,
  ROD_POWERS,
  ROD_SERIES_CATEGORIES,
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

/** ブランド・シリーズは任意。あれば参照が存在することを Catalog 側で確かめる。 */
const family = {
  brandId: nonEmptyString.transform(asBrandId).optional(),
  /** Product Series への参照。存在は Catalog の参照検査で確かめる。 */
  seriesId: nonEmptyString.optional(),
  series: nonEmptyString.optional(),
}

const base = { id, name: nonEmptyString, price, ...family }

export const rodSchema = z
  .strictObject({
    ...base,
    category: z.literal('rod'),
    lengthM: z.number().positive(),
    power: z.enum(ROD_POWERS),
    action: z.enum(ROD_ACTIONS),
    seriesCategory: z.enum(ROD_SERIES_CATEGORIES).optional(),
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
  sizeClass: z.union(REEL_SIZE_CLASSES.map((size) => z.literal(size))).optional(),
  variant: z.enum(REEL_VARIANTS).optional(),
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
  dragStartup: z.number().min(0).max(1).optional(),
  rigidity: z.number().min(0).max(1).optional(),
  windingTorque: z.number().min(0).max(1).optional(),
  response: z.number().min(0).max(1).optional(),
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
  /*
   * 正 = 号数（数字が大きいほど小さい針）、負 = `N/0`（数字が大きいほど大きい針）。
   * 0 は「どちらの系統でもない」ので使わない。
   */
  size: z
    .number()
    .finite()
    .refine((value) => value !== 0, { message: 'hook size must not be 0' }),
  strengthKg: z.number().positive(),
  gaugeMm: z.number().positive().optional(),
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
