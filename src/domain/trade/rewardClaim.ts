import type { ContactId } from '../ids'
import type { ContactReward } from './ContactReward'
import { hasClaimedReward, trustOf, type TradeState } from './TradeState'

/**
 * Trust 更新後に新しく claim できる報酬を確定する。
 *
 * threshold ちょうどでは付与せず、threshold「到達」で付与する（`trust >= minTrust`）。
 * 既に claim 済みなら再付与しない。Save / load をまたいでも重複しない
 * （`claimedRewardIds` を Save に永続化するのが唯一の判定材料）。
 */
export type RewardClaimResult = {
  readonly trade: TradeState
  readonly newlyClaimed: readonly ContactReward[]
}

export const claimEligibleRewards = (
  trade: TradeState,
  contactId: ContactId,
  rewards: readonly ContactReward[],
): RewardClaimResult => {
  const trust = trustOf(trade, contactId)
  const eligible = rewards.filter(
    (reward) =>
      reward.contactId === contactId &&
      trust >= reward.minTrust &&
      !hasClaimedReward(trade, reward.id),
  )

  if (eligible.length === 0) {
    return { trade, newlyClaimed: [] }
  }

  const claimedRewardIds = [...trade.claimedRewardIds, ...eligible.map((reward) => reward.id)]
  const knownRumorIds = [
    ...trade.knownRumorIds,
    ...eligible.filter((reward) => reward.kind === 'intel').map((reward) => reward.id),
  ]

  return {
    trade: { ...trade, claimedRewardIds, knownRumorIds },
    newlyClaimed: eligible,
  }
}
