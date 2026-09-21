import { asFishIndividualId, type FishingSpotId } from '../ids'
import type { RandomSource } from '../rng/RandomSource'
import type { FishIndividual } from './FishIndividual'
import type { FishSpecies } from './FishSpecies'
import {
  conditionBand,
  conditionWeightFactor,
  DEFAULT_CONDITION_MODEL,
  sampleCondition,
  type ConditionBand,
} from './fishCondition'
import {
  combineTraitModifiers,
  resolveTraits,
  resolveTraitConfiguration,
  type TraitModifiers,
} from './fishTraits'
import { lengthPercentile, sampleLengthCm } from './lengthModel'
import { roundTo } from './statistics'
import { estimateStandardWeightKg, weightRatio } from './weightModel'

/**
 * 魚種データから個体を 1 つ生成する。DATA_MODEL.md §3 の考え方に従い、
 * 世界中の魚を事前生成せず、ヒットした瞬間に 1 個体だけ作る。
 *
 * ここが Phase 2 の中心である:
 *
 *   Species → Length → Condition → Weight → Percentile → Trait
 *
 * 同じ seed・同じ魚種からは常に同じ個体が得られる。
 */

export type GeneratedFishIndividual = {
  readonly individual: FishIndividual
  readonly conditionBand: ConditionBand
  readonly traitModifiers: TraitModifiers
  /** 標準体重に対する比（Heavy 判定の根拠）。 */
  readonly weightRatio: number
}

export type GenerateFishIndividualOptions = {
  readonly species: FishSpecies
  readonly random: RandomSource
  /** 個体の identity。捕獲ごとに一意になる文字列を渡す。 */
  readonly individualSeed: string
  readonly spotId?: FishingSpotId
  readonly capturedAt?: string
}

/**
 * 個体を生成する。
 *
 * 乱数の消費順は**固定**である（体長 2 → コンディション 2 → Trait 4）。
 * 途中で順序や回数を変えると、同じ seed でも別の個体になる。
 */
export const generateFishIndividual = (
  options: GenerateFishIndividualOptions,
): GeneratedFishIndividual => {
  const { species, random, individualSeed } = options
  const conditionModel = species.conditionModel ?? DEFAULT_CONDITION_MODEL

  // 1. 体長（2 回）
  const lengthCm = sampleLengthCm(species.lengthModel, random)

  // 2. コンディション（2 回）
  const condition = sampleCondition(random, conditionModel)

  // 3. 体重（体長とコンディションから決まる。独立した乱数は使わない）
  const factor = conditionWeightFactor(condition)
  // 0.1 g 単位。小型の魚種でも丸め誤差が体格差を消さないようにする。
  const weightKg = roundTo(estimateStandardWeightKg(species.weightModel, lengthCm, factor), 4)

  // 4. 百分位（乱数なし）
  const percentile = roundTo(lengthPercentile(species.lengthModel, lengthCm), 2)
  const ratio = weightRatio(species.weightModel, lengthCm, weightKg)

  // 5. Trait（4 回）
  const configuration = resolveTraitConfiguration(species.traitConfiguration)
  const traits = resolveTraits(
    {
      configuration,
      percentile,
      weightRatio: ratio,
      speciesSpeed: species.fightProfile.speed,
    },
    random,
  )

  const individual: FishIndividual = {
    id: asFishIndividualId(individualSeed),
    speciesId: species.id,
    lengthCm,
    weightKg,
    condition: roundTo(condition, 3),
    traits,
    fightSeed: individualSeed,
    percentile,
    ...(options.spotId === undefined ? {} : { spotId: options.spotId }),
    ...(options.capturedAt === undefined ? {} : { capturedAt: options.capturedAt }),
  }

  return {
    individual,
    conditionBand: conditionBand(condition),
    traitModifiers: combineTraitModifiers(traits),
    weightRatio: ratio,
  }
}
