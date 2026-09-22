export {
  SEASONS,
  SEASON_LABELS,
  TIDES,
  TIDE_LABELS,
  TIME_OF_DAY,
  TIME_OF_DAY_LABELS,
  WATER_FLOWS,
  WATER_FLOW_LABELS,
  WATER_KINDS,
  WATER_KIND_LABELS,
  WEATHERS,
  WEATHER_LABELS,
  WIND_LEVEL_LABELS,
  HEMISPHERES,
  seasonOf,
  seasonalFactor,
  pickSummaryEnvironment,
  timeOfDayOf,
  waterKindOf,
} from './Environment'
export type {
  ClimateProfile,
  EnvironmentSnapshot,
  Season,
  Tide,
  TimeOfDay,
  WaterCondition,
  WaterFlow,
  WaterKind,
  Weather,
  WindLevel,
} from './Environment'

export { resolveEnvironment, tideFor, weatherFor } from './environmentResolver'

export {
  CONDITION_SUMMARIES,
  CONDITION_SUMMARY_LABELS,
  resolveFishingConditions,
  SEARCH_SIGN_LABELS,
  speciesEnvironmentMultiplier,
} from './fishingConditions'
export type {
  ConditionSummary,
  FishingConditions,
  SearchSign,
  SpeciesEnvironmentAffinity,
} from './fishingConditions'

export { searchWater } from './fishFinder'
export type { DepthSignal, FishFinderReading, SearchResult } from './fishFinder'
