import type { ContactId, ContactRewardId, FishingSpotId } from '../ids'

/**
 * Trust threshold を越えると得られる報酬（Phase 13）。
 *
 * data-driven。Domain には「どのkindがどう動くか」だけを持ち、報酬の中身
 * （テキスト・対象）は Content 側にある。1 度 claim したら再付与しない。
 */
export const CONTACT_REWARD_KINDS = ['intel', 'discover_spot', 'introduce_contact'] as const
export type ContactRewardKind = (typeof CONTACT_REWARD_KINDS)[number]

export type ContactReward = {
  readonly id: ContactRewardId
  readonly contactId: ContactId
  readonly minTrust: number
  readonly kind: ContactRewardKind
  /** intel: 噂の本文。discover_spot / introduce_contact: 表示用の補足。 */
  readonly message: string
  /** discover_spot: FishingSpotId。introduce_contact: ContactId。intel: 未使用。 */
  readonly targetId?: FishingSpotId | ContactId
}
