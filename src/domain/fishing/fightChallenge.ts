import type { FightCapability } from './FightCapability'
import type { FightDemand } from './FightDemand'

/**
 * Fight Challenge（Phase 18A）。
 *
 * 「Big Game かどうか」は魚種タグではなく、
 * **FightDemand vs FightCapability の相対比**で決まる。
 * 情報表示・Readiness 用の評価であり、ファイトを hard lock しない。
 */

export const FIGHT_CHALLENGES = ['easy', 'manageable', 'demanding', 'extreme'] as const
export type FightChallenge = (typeof FIGHT_CHALLENGES)[number]

export const FIGHT_CHALLENGE_LABELS: Readonly<Record<FightChallenge, string>> = {
  easy: '余裕',
  manageable: '対応可能',
  demanding: '厳しい',
  extreme: '過酷',
}

/**
 * 帯の境界（PROVISIONAL gameplay tuning）。
 *
 * ratio = 魚が要求する負荷（demandKg） / タックルの有効強度（weak link 基準）
 *
 *   2kg 魚 + 5kg ライン構成  → ~0.3  → easy
 *   30kg 魚 + 30kg 級構成   → ~0.9  → demanding
 *   30kg 魚 + 4kg ライン構成 → ~6    → extreme
 *   150kg 魚 + 40kg 級構成  → ~3.7  → extreme
 */
export type FightChallengeBands = {
  readonly easyBelow: number
  readonly manageableBelow: number
  readonly demandingBelow: number
}

export const DEFAULT_FIGHT_CHALLENGE_BANDS: FightChallengeBands = {
  easyBelow: 0.35,
  manageableBelow: 0.75,
  demandingBelow: 1.6,
}

export const resolveFightChallenge = (
  demand: FightDemand,
  capability: FightCapability,
  bands: FightChallengeBands = DEFAULT_FIGHT_CHALLENGE_BANDS,
): FightChallenge => {
  /*
   * タックル側の有効強度は「最弱点の強度」を基準にする
   * （太いラインに弱いリーダーでは意味がない）。ロッドの主導権で少し補正する。
   */
  const effectiveStrengthKg = capability.weakLinkStrengthKg * (0.6 + 0.4 * capability.rodControl)
  const ratio = demand.demandKg / Math.max(0.5, effectiveStrengthKg)

  if (ratio < bands.easyBelow) {
    return 'easy'
  }

  if (ratio < bands.manageableBelow) {
    return 'manageable'
  }

  if (ratio < bands.demandingBelow) {
    return 'demanding'
  }

  return 'extreme'
}
