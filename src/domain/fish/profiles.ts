import type { RegionId } from '../ids'
import type { DayPeriod, Month, Normalized, Range } from '../primitives'

/**
 * PROVISIONAL — 設計文書で名前のみ定義され、構造が未確定の概念。
 *
 * DATA_MODEL.md §2 は SeasonalProfile / TimeProfile / TideProfile / CurrentProfile /
 * LengthDistribution / WeightModel / FightProfile / HabitatType / RegionRef を
 * 型名としてのみ提示している。Phase 0B では「最小の表現」を選び、
 * 実データを投入する Phase 2 / Phase 4 で正式化する。
 *
 * ここでの選択はバランス値ではなく構造の最小化であり、
 * 確定後に自由に拡張してよい（Content 追加で Engine を書き換えない、が原則）。
 */

/** 分布の参照。DATA_MODEL.md では RegionRef とのみ表記されている。 */
export type RegionRef = RegionId

/** 生息環境タグ。列挙は実コンテンツ投入時に確定する（それまで open string）。 */
export type HabitatType = string

/** ファイト特性。値は 0〜1 の相対スケール。 */
export type FightProfile = {
  readonly strength: Normalized
  readonly stamina: Normalized
  readonly speed: Normalized
}

/** 季節性。空配列は「周年」を意味する。 */
export type SeasonalProfile = {
  readonly months: readonly Month[]
}

/** 時間帯活動。 */
export type TimeProfile = {
  readonly periods: readonly DayPeriod[]
}

/** 潮の選好。 */
export const TIDE_PREFERENCES = ['low', 'rising', 'high', 'falling', 'any'] as const
export type TidePreference = (typeof TIDE_PREFERENCES)[number]
export type TideProfile = {
  readonly preference: TidePreference
}

/** 流れの選好。 */
export const CURRENT_PREFERENCES = ['none', 'slow', 'moderate', 'strong', 'any'] as const
export type CurrentPreference = (typeof CURRENT_PREFERENCES)[number]
export type CurrentProfile = {
  readonly preference: CurrentPreference
}

/** 水深プロファイル（m）。 */
export type DepthProfile = {
  readonly depthRangeM: Range
}
