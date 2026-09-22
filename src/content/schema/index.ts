import { gearItemSchema } from './gear'
import { gearSeriesSchema } from './gearSeries'
import { brandSchema } from './brand'
import { methodSchema } from './method'
import { shopItemSchema } from './shopItem'
import type { z } from 'zod'
import { fishingSpotSchema } from './fishingSpot'
import { fishSpeciesSchema } from './fishSpecies'
import { regulationSchema } from './regulation'
import { transportSchema } from './transport'
import { countrySchema } from './country'
import { regionSchema } from './region'
import { expeditionSchema } from './expedition'
import { buyerSchema } from './buyer'
import { contactSchema } from './contact'
import { speciesTradeProfileSchema } from './speciesTradeProfile'
import { contactRewardSchema } from './contactReward'

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
  'shop-items': shopItemSchema,
  brands: brandSchema,
  'gear-series': gearSeriesSchema,
  gear: gearItemSchema,
  methods: methodSchema,
  countries: countrySchema,
  regions: regionSchema,
  expeditions: expeditionSchema,
  buyers: buyerSchema,
  contacts: contactSchema,
  'species-trade-profiles': speciesTradeProfileSchema,
  'contact-rewards': contactRewardSchema,
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
  | {
      readonly ok: true
      /** スキーマを通った値（正規化済み。id は branded になっている）。 */
      readonly value: unknown
    }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

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
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'fishing-spots': {
      const result = fishingSpotSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'transports': {
      const result = transportSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'regulations': {
      const result = regulationSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'shop-items': {
      const result = shopItemSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'brands': {
      const result = brandSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'gear-series': {
      const result = gearSeriesSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'gear': {
      const result = gearItemSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'methods': {
      const result = methodSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'countries': {
      const result = countrySchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'regions': {
      const result = regionSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'expeditions': {
      const result = expeditionSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'buyers': {
      const result = buyerSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'contacts': {
      const result = contactSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'species-trade-profiles': {
      const result = speciesTradeProfileSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
    case 'contact-rewards': {
      const result = contactRewardSchema.safeParse(value)
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error) }
    }
  }
}

export { fishingSpotSchema, fishSpeciesSchema, regulationSchema, transportSchema }
export { brandSchema } from './brand'
export { gearSeriesSchema } from './gearSeries'
export { accessRequirementSchema } from './accessRequirement'
export { conditionModelSchema } from './conditionModel'
export { fishOccurrenceSchema } from './fishOccurrence'
export { lengthDistributionSchema } from './lengthModel'
export { spotDataStatusSchema, spotTravelOptionSchema, spotVisibilitySchema } from './fishingSpot'
export { gearItemSchema } from './gear'
export { methodSchema } from './method'
export { shopItemSchema } from './shopItem'
export { sourceRefSchema, sourceRefsSchema } from './sourceRef'
export { traitConfigurationSchema } from './traitConfiguration'
export { weightModelSchema } from './weightModel'
export {
  depthProfileSchema,
  fightProfileSchema,
  seasonalProfileSchema,
  timeProfileSchema,
} from './profiles'
export { countrySchema } from './country'
export { regionSchema } from './region'
export { expeditionSchema } from './expedition'
export { buyerSchema } from './buyer'
export { contactSchema } from './contact'
export { speciesTradeProfileSchema } from './speciesTradeProfile'
export { contactRewardSchema } from './contactReward'
