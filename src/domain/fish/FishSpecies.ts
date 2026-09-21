import type { FishSpeciesId } from '../ids'
import type { Range, WaterType } from '../primitives'
import type { SourceRef } from '../source/SourceRef'
import type {
  CurrentProfile,
  FightProfile,
  HabitatType,
  LengthDistribution,
  RegionRef,
  SeasonalProfile,
  TideProfile,
  TimeProfile,
  WeightModel,
} from './profiles'

/** 分類情報。DATA_MODEL.md §2 の taxonomy。 */
export type Taxonomy = {
  readonly family?: string
  readonly genus?: string
}

/**
 * 魚種。DATA_MODEL.md §2 に対応する。
 *
 * 個体（FishIndividual）とは別概念であることに注意（GAME_DESIGN.md §5.1）。
 */
export type FishSpecies = {
  readonly id: FishSpeciesId
  readonly japaneseName: string
  readonly scientificName?: string
  readonly taxonomy?: Taxonomy

  readonly waterTypes: readonly WaterType[]
  readonly distribution: readonly RegionRef[]
  readonly habitats: readonly HabitatType[]
  readonly depthRange?: Range
  readonly temperatureRange?: Range

  readonly seasonality?: SeasonalProfile
  readonly timeActivity?: TimeProfile
  readonly tidePreference?: TideProfile
  readonly currentPreference?: CurrentProfile

  readonly diet?: readonly string[]
  readonly baits?: readonly string[]
  readonly lureCategories?: readonly string[]
  readonly fishingMethods?: readonly string[]

  readonly lengthModel: LengthDistribution
  readonly weightModel?: WeightModel
  readonly fightProfile: FightProfile

  readonly rarity: number

  readonly sourceRefs?: readonly SourceRef[]
}
