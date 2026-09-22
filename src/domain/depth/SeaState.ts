import type { EnvironmentSnapshot, WindLevel } from '../environment'

/**
 * Sea State（Phase 17A）。
 *
 * ゲーム上の抽象表現であり、実際の海洋予報・波高シミュレーションではない。
 * 既存 Environment（Phase 9）の風レベルだけから決める。Region ID / 天候の
 * 詳細な物理モデルは作らない。
 */
export const SEA_STATES = ['calm', 'moderate', 'rough'] as const
export type SeaState = (typeof SEA_STATES)[number]

export const SEA_STATE_LABELS: Readonly<Record<SeaState, string>> = {
  calm: '穏やか',
  moderate: 'ややうねり',
  rough: '荒れ気味',
}

const SEA_STATE_BY_WIND: Readonly<Record<WindLevel, SeaState>> = {
  calm: 'calm',
  breezy: 'moderate',
  strong: 'rough',
}

export const resolveSeaState = (environment: EnvironmentSnapshot): SeaState =>
  SEA_STATE_BY_WIND[environment.water.wind]
