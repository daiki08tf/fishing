import { z } from 'zod'

/**
 * 設計文書側で構造が未確定の概念に対する、最小の検証可能表現。
 * 詳細な判断理由は src/domain/primitives.ts および各 PROVISIONAL コメントを参照。
 */

export const monthSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
])

export const dayPeriodSchema = z.enum(['dawn', 'morning', 'day', 'evening', 'night'])

export const waterTypeSchema = z.enum(['fresh', 'brackish', 'salt'])

export const rangeSchema = z
  .strictObject({
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .refine((range) => range.min <= range.max, {
    message: 'min must be less than or equal to max',
    path: ['min'],
  })

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')

export const isoDateTimeSchema = z.string().min(1)

export const nonEmptyString = z.string().min(1)
