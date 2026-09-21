export { FISH_TRAITS } from './FishTrait'
export type { FishTrait } from './FishTrait'

export type { FishIndividual } from './FishIndividual'
export type { FishSpecies, Taxonomy } from './FishSpecies'

export {
  CONDITION_BANDS,
  conditionBand,
  conditionWeightFactor,
  DEFAULT_CONDITION_MODEL,
  sampleCondition,
} from './fishCondition'
export type { ConditionBand, ConditionModel } from './fishCondition'

export {
  combineTraitModifiers,
  DEFAULT_TRAIT_CONFIGURATION,
  NO_TRAIT_MODIFIERS,
  resolveTraits,
  resolveTraitConfiguration,
  TRAIT_MODIFIERS,
} from './fishTraits'
export type {
  TraitConfiguration,
  TraitConfigurationOverride,
  TraitModifiers,
  TraitResolutionContext,
} from './fishTraits'

export { lengthModelMedian, lengthPercentile, sampleLengthCm } from './lengthModel'
export type { LengthDistribution, LogNormalLengthModel, NormalLengthModel } from './lengthModel'

export { estimateStandardWeightKg, weightRatio } from './weightModel'
export type { WeightModel } from './weightModel'

export { generateFishIndividual } from './generateFishIndividual'
export type {
  GeneratedFishIndividual,
  GenerateFishIndividualOptions,
} from './generateFishIndividual'
