import type { ContactId, ContactRewardId } from '../ids'
import { emptyFishBoxState, type FishBoxState } from './FishBox'

/**
 * Trade / Contact の player state（Save の独立ブロック）。
 *
 * 既存の `hiddenSpotState` のような二重 state を作らない。
 * Hidden Spot の discover 済みかどうかは既存の `world.discoveredSpotIds` を
 * そのまま authority として使う（ここでは持たない）。
 */
export type ContactTrustState = Readonly<Record<string, number>>

export type TradeState = {
  readonly fishBox: FishBoxState
  /** contactId（買取先を含む）→ Trust（0〜100）。 */
  readonly contactTrust: ContactTrustState
  readonly claimedRewardIds: readonly ContactRewardId[]
  /** intel 種別の報酬から得た噂。Contacts 画面で見せる。 */
  readonly knownRumorIds: readonly ContactRewardId[]
}

export const createInitialTradeState = (): TradeState => ({
  fishBox: emptyFishBoxState(),
  contactTrust: {},
  claimedRewardIds: [],
  knownRumorIds: [],
})

export const trustOf = (state: TradeState, contactId: ContactId): number =>
  state.contactTrust[String(contactId)] ?? 0

/**
 * Trust を汎用に加算する（取引以外の経路 — Charter 完了など — から使う）。
 * 0 以下は無視し、100 で頭打ちにする（`sellCatches` の実際の増分計算と同じ規則）。
 */
export const addContactTrust = (
  state: TradeState,
  contactId: ContactId,
  amount: number,
): TradeState => {
  if (amount <= 0) {
    return state
  }

  const before = trustOf(state, contactId)
  const after = Math.min(100, before + amount)

  if (after === before) {
    return state
  }

  return {
    ...state,
    contactTrust: { ...state.contactTrust, [String(contactId)]: after },
  }
}

export const hasClaimedReward = (state: TradeState, rewardId: ContactRewardId): boolean =>
  state.claimedRewardIds.includes(rewardId)
