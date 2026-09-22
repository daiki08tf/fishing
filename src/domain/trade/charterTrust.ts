import type { TransportDefinition } from '../access/Transport'
import type { ContactId } from '../ids'
import { addContactTrust, type TradeState } from './TradeState'

/**
 * Charter 釣行完了時の Captain / Guide Trust 加算（Phase 17C）。
 *
 * - 対象は `TransportDefinition.operatorContactId` を持つ Transport だけ
 *   （Transport-ID の分岐ではなく、汎用フィールドの有無で判定する）。
 * - **ボウズでも Trust は入る**（Base はキャッチ数に依存しない）。
 *   釣果ボーナスは小さく・頭打ちにする（1 回の釣行で Trust が跳ねない）。
 * - 数値は PROVISIONAL。バランス調整は Phase 17E で行う。
 */

export const CHARTER_BASE_TRUST_GAIN = 4
export const CHARTER_MAX_CATCH_BONUS = 2

export type CharterTripOutcome = {
  readonly trade: TradeState
  /** 実際に加算された Trust（対象 Contact が無ければ 0）。 */
  readonly trustGain: number
  /** Trust が加算された Contact（無ければ null）。 */
  readonly contactId: ContactId | null
}

export const applyCharterTripOutcome = (
  trade: TradeState,
  transport: TransportDefinition | null,
  catches: number,
): CharterTripOutcome => {
  const contactId: ContactId | null = transport?.operatorContactId ?? null

  if (contactId === null) {
    return { trade, trustGain: 0, contactId: null }
  }

  const catchBonus = Math.min(CHARTER_MAX_CATCH_BONUS, Math.max(0, catches))
  const trustGain = CHARTER_BASE_TRUST_GAIN + catchBonus

  return {
    trade: addContactTrust(trade, contactId, trustGain),
    trustGain,
    contactId,
  }
}
