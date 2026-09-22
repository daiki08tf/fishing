import { z } from 'zod'
import {
  asContactId,
  asContactRewardId,
  type ContactId,
  type FishingSpotId,
} from '../../domain/ids'
import { CONTACT_REWARD_KINDS } from '../../domain/trade/ContactReward'
import { nonEmptyString } from './primitives'

/**
 * ContactReward（Phase 13）。
 *
 * targetId の意味は kind によって変わる:
 * - intel: 未使用
 * - discover_spot: FishingSpotId
 * - introduce_contact: ContactId
 *
 * ここでは branded string として緩く検証し、実在確認は Content 参照検証側で行う
 * （kind ごとに参照先の集合が異なるため）。
 */
export const contactRewardSchema = z.strictObject({
  id: nonEmptyString.transform(asContactRewardId),
  contactId: nonEmptyString.transform(asContactId),
  minTrust: z.number().int().min(0).max(100),
  kind: z.enum(CONTACT_REWARD_KINDS),
  message: nonEmptyString,
  targetId: nonEmptyString
    .transform((value) => value as unknown as FishingSpotId | ContactId)
    .optional(),
})
