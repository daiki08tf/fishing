import type { CodexState } from './FishRecord'

/**
 * Big Game Records（Phase 18C）。
 *
 * 新しい永続 state は作らない。既存の Codex / Personal Best
 * （SpeciesRecord.personalBest / heaviestWeightKg / bestPercentile）から
 * 「大型魚の記録」だけを derive する。
 *
 * 未捕獲の Species は一切出さない（Codex の「未捕獲は推測させない」
 * ルールに従う。記録がある魚だけが見える）。
 */

export type BigGameRecord = {
  readonly speciesId: string
  /** 最も重い個体の重さ（kg）。 */
  readonly weightKg: number
  readonly lengthCm: number
  /** 最も珍しかった個体の百分位。 */
  readonly percentile: number
  /** 「Top X%」表示用（例: percentile 99.2 → Top 0.8%）。 */
  readonly topPercent: number
  readonly catchCount: number
}

/** PROVISIONAL: 「Big Game の記録」として数える下限。 */
export const BIG_GAME_RECORD_MIN_WEIGHT_KG = 20
export const BIG_GAME_RECORD_MIN_PERCENTILE = 90
/**
 * Percentile 経由で数える場合の最低重量（kg）。
 * percentile は「その種の中では大きい」という意味であって、
 * 小型種のトロフィーは絶対的な負荷を伴わないので Big Game にはしない。
 */
export const BIG_GAME_RECORD_PERCENTILE_WEIGHT_FLOOR_KG = 10

export const isBigGameRecord = (record: {
  readonly heaviestWeightKg: number
  readonly bestPercentile: number
}): boolean =>
  record.heaviestWeightKg >= BIG_GAME_RECORD_MIN_WEIGHT_KG ||
  (record.heaviestWeightKg >= BIG_GAME_RECORD_PERCENTILE_WEIGHT_FLOOR_KG &&
    record.bestPercentile >= BIG_GAME_RECORD_MIN_PERCENTILE)

/** 記録を重い順に返す。 */
export const bigGameRecords = (state: CodexState): readonly BigGameRecord[] =>
  Object.values(state.species)
    .filter(isBigGameRecord)
    .map((record) => ({
      speciesId: String(record.speciesId),
      weightKg: record.heaviestWeightKg,
      lengthCm: record.personalBest.lengthCm,
      percentile: record.bestPercentile,
      topPercent: Math.max(0, Math.round((100 - record.bestPercentile) * 10) / 10),
      catchCount: record.catchCount,
    }))
    .sort((left, right) => right.weightKg - left.weightKg)

/** 大型魚を捕獲したことがあるか（Readiness の Knowledge masking に使う）。 */
export const hasBigGameExperience = (state: CodexState): boolean =>
  Object.values(state.species).some(isBigGameRecord)
