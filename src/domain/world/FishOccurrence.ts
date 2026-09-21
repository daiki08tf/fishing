import type { FishSpeciesId } from '../ids'
import type { Range } from '../primitives'
import type { SeasonalProfile, TideProfile, TimeProfile } from '../fish/profiles'

/**
 * Spot と魚種の出現関係。DATA_MODEL.md §7 に対応する。
 *
 * 「Spot に魚種を置く」のではなく、条件に応じて Encounter Weight を算出するための入力。
 */
export type FishOccurrence = {
  readonly speciesId: FishSpeciesId
  readonly basePresence: number

  readonly season?: SeasonalProfile
  readonly time?: TimeProfile
  readonly tide?: TideProfile
  readonly temperature?: Range

  readonly preferredHabitats?: readonly string[]

  /**
   * Phase 11: Zone ごとの存在量倍率。
   * 未指定 Zone は 1.0（従来どおり）。0 は「その Zone には通常いない」を表すが、
   * 魚種そのものをゲームから hard lock するものではない。
   */
  readonly zoneAffinity?: Readonly<Record<string, number>>

  readonly sizeModifier?: number
}
