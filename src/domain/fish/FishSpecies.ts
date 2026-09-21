import type { FishSpeciesId } from '../ids'
import type { Range, WaterType } from '../primitives'
import type { SourceRef } from '../source/SourceRef'
import type { ConditionModel } from './fishCondition'
import type { TraitConfigurationOverride } from './fishTraits'
import type { LengthDistribution } from './lengthModel'
import type {
  CurrentProfile,
  FightProfile,
  HabitatType,
  RegionRef,
  SeasonalProfile,
  TideProfile,
  TimeProfile,
} from './profiles'
import type { WeightModel } from './weightModel'

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

  /**
   * 釣法との相性（methodId → 倍率）。Phase 6 で導入。
   * PROVISIONAL — 現在の魚種はすべて検証用データであり、生物学的な事実ではない。
   */
  readonly methodAffinity?: Readonly<Record<string, number>>
  /** offering のタグとの相性（lureType / targetProfile → 倍率）。 */
  readonly offeringAffinity?: Readonly<Record<string, number>>

  readonly lengthModel: LengthDistribution
  /** 体長-体重関係。Phase 2 で必須にした（体重は体長から導出する）。 */
  readonly weightModel: WeightModel
  readonly conditionModel?: ConditionModel
  readonly traitConfiguration?: TraitConfigurationOverride
  readonly fightProfile: FightProfile

  readonly rarity: number

  readonly sourceRefs?: readonly SourceRef[]
}
