import type { FishingSpotId, FishSpeciesId, RegionId, RegulationId } from '../ids'
import type { IsoDate, Month } from '../primitives'
import type { SourceRef } from '../source/SourceRef'

/**
 * 地域・法令ルール。DATA_MODEL.md §14 に対応する。
 *
 * 現実の制度は変更され得るため、source / validFrom / validTo を保持する
 * （GAME_DESIGN.md §13）。
 */
export const REGULATION_TYPES = [
  'permit',
  'closed_season',
  'closed_area',
  'size_limit',
  'bag_limit',
  'method_restriction',
] as const

export type RegulationType = (typeof REGULATION_TYPES)[number]

export type Regulation = {
  readonly id: RegulationId
  readonly type: RegulationType

  readonly regionId?: RegionId
  readonly spotId?: FishingSpotId
  readonly speciesId?: FishSpeciesId

  /**
   * PROVISIONAL — DATA_MODEL.md は数値制限の保持先を定義していない。
   * size_limit / bag_limit の制限値のみを最小表現として保持する。
   */
  readonly value?: number

  /** PROVISIONAL — closed_season の対象月。 */
  readonly months?: readonly Month[]

  readonly validFrom?: IsoDate
  readonly validTo?: IsoDate

  readonly sourceRefs: readonly SourceRef[]
}
