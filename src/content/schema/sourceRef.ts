import { z } from 'zod'
import { asSourceRefId } from '../../domain/ids'
import { isoDateSchema, nonEmptyString } from './primitives'

/**
 * SourceRef。DATA_MODEL.md §15 に対応する。
 *
 * 実在データを扱うため、出典は Content 側の必須要素になり得る。
 * ここでは「与えられた場合に構造として正しいか」を検証する。
 */
export const sourceRefSchema = z.strictObject({
  id: nonEmptyString.transform(asSourceRefId),
  title: nonEmptyString,
  url: z.url().optional(),
  publisher: nonEmptyString.optional(),
  accessedAt: isoDateSchema.optional(),
  verifiedAt: isoDateSchema.optional(),
})

export const sourceRefsSchema = z.array(sourceRefSchema)
