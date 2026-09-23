/**
 * Phase 18B: FightStage — 表示用のファイト進行度。
 *
 * FishingPhase とは別の「第2の状態機械」ではない。現在の battle 状態
 * （スタミナ・距離・ステップ数）から毎回 derive するだけの表示概念。
 * Save には保存しない。
 */

export const FIGHT_STAGES = ['opening', 'working', 'endgame', 'landing'] as const

export type FightStage = (typeof FIGHT_STAGES)[number]

export const FIGHT_STAGE_LABELS: Readonly<Record<FightStage, string>> = {
  opening: '序盤',
  working: '攻防',
  endgame: '終盤',
  landing: '取り込み',
}

export interface FightStageInput {
  /** 'FIGHTING' / 'LANDING' など。FIGHTING 以外は LANDING でなければ opening 扱いしない。 */
  phase: string
  /** 0..1。魚の残りスタミナ割合。 */
  staminaRatio: number
  /** 残りの gameplay 距離。 */
  distanceM: number
  /** これまでの battle ステップ数。 */
  step: number
}

/**
 * - opening: 魚が新鮮（first run が出やすい序盤）
 * - working: 中盤のやり取り
 * - endgame: 魚が弱ってきた — ただし second_run の危険が残る
 * - landing: LANDING phase
 */
export function resolveFightStage(input: FightStageInput): FightStage {
  if (input.phase === 'LANDING') {
    return 'landing'
  }
  if (input.phase !== 'FIGHTING') {
    return 'opening'
  }
  if (input.staminaRatio <= 0.35 || (input.distanceM <= 10 && input.staminaRatio <= 0.5)) {
    return 'endgame'
  }
  if (input.step <= 2 || input.staminaRatio >= 0.75) {
    return 'opening'
  }
  return 'working'
}
