import type { ContactId, ContactRewardId, RegionId } from '../ids'
import type { BuyerDefinition } from './Buyer'
import type { ContactReward } from './ContactReward'

/**
 * 汎用 Contact（Phase 17C）。
 *
 * Phase 13 の Contact は Buyer（買取先）しかなかった。Charter の船長・ガイド・
 * 地元の釣り人・レンタル店のスタッフのように、**買い取りをしない** Contact を
 * 表すための最小の型。Buyer と同じ ID 空間（ContactId）を共有するので、
 * `TradeState.contactTrust` / `ContactReward.contactId` はどちらにも使える
 * （Trust・報酬の authority を二重化しない）。
 *
 * 会話ツリー・NPC シミュレーターは作らない。役割（type）と短い説明だけを持つ。
 */
export const CONTACT_TYPES = ['captain', 'guide', 'local_fisher', 'rental_staff'] as const
export type ContactType = (typeof CONTACT_TYPES)[number]

export const CONTACT_DATA_STATUSES = ['provisional', 'verified'] as const
export type ContactDataStatus = (typeof CONTACT_DATA_STATUSES)[number]

export type ContactDefinition = {
  readonly id: ContactId
  readonly regionId: RegionId
  readonly name: string
  readonly type: ContactType
  /** 短い役割の説明（Buyer.description と同じ位置づけ）。 */
  readonly role: string
  /**
   * 最初から知っているか。false の場合、`introduce_contact` 報酬を claim する
   * までプレイヤーは存在を知らない（`isContactKnown` で判定する）。
   */
  readonly initiallyKnown: boolean
  readonly dataStatus: ContactDataStatus
}

/**
 * この Contact をプレイヤーが知っているか。
 *
 * 新しい永続 state は増やさない。`initiallyKnown` と、既存の
 * `claimedRewardIds`（`introduce_contact` 報酬）だけから derive する。
 */
export const isContactKnown = (
  contact: ContactDefinition,
  contactRewards: readonly ContactReward[],
  claimedRewardIds: readonly ContactRewardId[],
): boolean => {
  if (contact.initiallyKnown) {
    return true
  }

  return contactRewards.some(
    (reward) =>
      reward.kind === 'introduce_contact' &&
      String(reward.targetId) === String(contact.id) &&
      claimedRewardIds.includes(reward.id),
  )
}

/**
 * プレイヤーが「知っている」Contact の ID 集合（Phase 17 Final Fix）。
 *
 * `AccessEngine`（`AccessEvaluationInput.knownContactIds`）が Charter Transport
 * （`operatorContactId` あり）の利用可否を判定するための入力を、ここで一度だけ
 * 組み立てる。Buyer は Trade 画面に常に出る既存の買取先なので常に「知っている」
 * 扱いにする。汎用 Contact は既存の `isContactKnown` と同じ規則。
 * 新しい永続 state は増やさない（`initiallyKnown` + 既存 claimedRewardIds から derive）。
 */
export const knownContactIdsOf = (
  buyers: readonly BuyerDefinition[],
  contacts: readonly ContactDefinition[],
  contactRewards: readonly ContactReward[],
  claimedRewardIds: readonly ContactRewardId[],
): ReadonlySet<string> => {
  const known = new Set<string>(buyers.map((buyer) => String(buyer.id)))

  for (const contact of contacts) {
    if (isContactKnown(contact, contactRewards, claimedRewardIds)) {
      known.add(String(contact.id))
    }
  }

  return known
}
