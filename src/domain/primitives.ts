/**
 * 設計文書で名前だけが定義され、構造が未定義の概念に対する最小表現。
 *
 * DATA_MODEL.md は Range / Month 等の一部を型名としてのみ提示しており、
 * 具体的な構造を確定していない。Phase 0B では「最小の表現」を選び、
 * 実データ投入時（Phase 2 / Phase 4）に正式化する。
 */

export type Range = {
  readonly min: number
  readonly max: number
}

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export const MONTHS: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** 時間帯。ROADMAP Phase 4 の morning / evening / night を含む最小集合。 */
export const DAY_PERIODS = ['dawn', 'morning', 'day', 'evening', 'night'] as const
export type DayPeriod = (typeof DAY_PERIODS)[number]

/** 水域の基本区分。DATA_MODEL.md FishSpecies.waterTypes に対応する。 */
export const WATER_TYPES = ['fresh', 'brackish', 'salt'] as const
export type WaterType = (typeof WATER_TYPES)[number]

/** 0〜1 に正規化された相対値。絶対値の意味は各所で定義する。 */
export type Normalized = number

/** ISO 8601 の日時文字列。 */
export type IsoDateTime = string

/** ISO 8601 の日付文字列（YYYY-MM-DD）。 */
export type IsoDate = string
