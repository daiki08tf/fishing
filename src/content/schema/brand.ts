import { z } from 'zod'
import { asBrandId } from '../../domain/ids'
import { nonEmptyString } from './primitives'

/**
 * 架空ブランド。DECISIONS.md §1 のとおり、初期は架空のみ。
 * 実在ブランドは、同じ形のまま Content を追加すれば載る（Engine は変えない）。
 * ブランドは性能倍率を持たない（表示と整理のためだけの属性）。
 */
export const brandSchema = z.strictObject({
  id: nonEmptyString.transform(asBrandId),
  name: nonEmptyString,
  description: nonEmptyString,
  specialties: z.array(nonEmptyString),
  countryStyle: nonEmptyString,
  tagline: nonEmptyString,
})
