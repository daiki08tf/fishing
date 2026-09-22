import { z } from 'zod'
import { asContactId, asRegionId } from '../../domain/ids'
import { CONTACT_DATA_STATUSES, CONTACT_TYPES } from '../../domain/trade/Contact'
import { nonEmptyString } from './primitives'

/**
 * 汎用 Contact（Phase 17C）。買い取りをしない Contact（船長・ガイド・地元の釣り人・
 * レンタル店のスタッフ）。Buyer と同じ ID 空間（ContactId）を使う。
 */
export const contactSchema = z.strictObject({
  id: nonEmptyString.transform(asContactId),
  regionId: nonEmptyString.transform(asRegionId),
  name: nonEmptyString,
  type: z.enum(CONTACT_TYPES),
  role: nonEmptyString,
  initiallyKnown: z.boolean(),
  dataStatus: z.enum(CONTACT_DATA_STATUSES),
})
