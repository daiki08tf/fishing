import type { z } from 'zod'
import { fishingSpotSchema } from './fishingSpot'
import { fishSpeciesSchema } from './fishSpecies'
import { regulationSchema } from './regulation'
import { transportSchema } from './transport'

/**
 * Content の種別とスキーマの対応。
 *
 * ディレクトリ名がそのまま種別名になる（src/content/data/<kind>/*.json）。
 * 新しい種別を追加するときは、ここへ 1 行追加するだけでよい。
 */
export const CONTENT_SCHEMAS = {
  'fish-species': fishSpeciesSchema,
  'fishing-spots': fishingSpotSchema,
  transports: transportSchema,
  regulations: regulationSchema,
} as const

export type ContentKind = keyof typeof CONTENT_SCHEMAS

export const CONTENT_KINDS = Object.keys(CONTENT_SCHEMAS) as readonly ContentKind[]

export const isContentKind = (value: string): value is ContentKind =>
  Object.prototype.hasOwnProperty.call(CONTENT_SCHEMAS, value)

export type ContentIssue = {
  /** レコード内の位置。ファイル単位の問題では空文字。 */
  readonly path: string
  readonly message: string
}

export type ContentParseResult =
  { readonly ok: true } | { readonly ok: false; readonly issues: readonly ContentIssue[] }

const toIssues = (error: z.ZodError): readonly ContentIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))

/**
 * Content レコードを種別ごとのスキーマで検証する。
 *
 * switch で分岐するのは、Zod スキーマの union をそのまま呼ぶと
 * 型引数が混ざるため。分岐ごとに出力型が確定する。
 */
export const parseContentRecord = (kind: ContentKind, value: unknown): ContentParseResult => {
  switch (kind) {
    case 'fish-species': {
      const result = fishSpeciesSchema.safeParse(value)
      return result.success ? { ok: true } : { ok: false, issues: toIssues(result.error) }
    }
    case 'fishing-spots': {
      const result = fishingSpotSchema.safeParse(value)
      return result.success ? { ok: true } : { ok: false, issues: toIssues(result.error) }
    }
    case 'transports': {
      const result = transportSchema.safeParse(value)
      return result.success ? { ok: true } : { ok: false, issues: toIssues(result.error) }
    }
    case 'regulations': {
      const result = regulationSchema.safeParse(value)
      return result.success ? { ok: true } : { ok: false, issues: toIssues(result.error) }
    }
  }
}

export { fishingSpotSchema, fishSpeciesSchema, regulationSchema, transportSchema }
export { accessRequirementSchema } from './accessRequirement'
export { fishOccurrenceSchema } from './fishOccurrence'
export { sourceRefSchema, sourceRefsSchema } from './sourceRef'
export {
  depthProfileSchema,
  fightProfileSchema,
  lengthDistributionSchema,
  seasonalProfileSchema,
  timeProfileSchema,
  weightModelSchema,
} from './profiles'
