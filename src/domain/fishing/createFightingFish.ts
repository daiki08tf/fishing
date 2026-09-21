import type { FishSpecies } from '../fish/FishSpecies'
import type { LengthDistribution, WeightModel } from '../fish/profiles'
import type { RandomSource } from '../rng/RandomSource'
import type { FightingFish } from './FightingFish'
import { DEFAULT_FISHING_TUNING, type FishingTuning } from './FishingTuning'

/**
 * 魚種データから 1 個体を生成する。
 *
 * DATA_MODEL.md §3 の考え方に従い、世界中の魚を事前生成せず、
 * ヒットした瞬間に 1 個体だけ生成する。
 *
 * 同じ seed と同じ魚種からは、常に同じ個体が得られる（決定論的）。
 * 乱数の消費順は固定であり、途中で変えると再現性が壊れる。
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 標準正規分布に従う値を 1 つ引く（Box-Muller）。 */
const sampleStandardNormal = (random: RandomSource): number => {
  const u1 = Math.max(random.next(), Number.EPSILON)
  const u2 = random.next()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** 体長分布から 1 つ引く。分布の外へは出さない。 */
export const sampleLengthCm = (model: LengthDistribution, random: RandomSource): number => {
  const raw = model.meanCm + model.standardDeviationCm * sampleStandardNormal(random)
  return roundTo(clamp(raw, model.minCm, model.maxCm), 1)
}

/**
 * 体長から重量を推定する（W = a * L^b）。
 * weightModel が無い魚種では重量を扱わない。
 */
export const estimateWeightKg = (model: WeightModel, lengthCm: number): number =>
  roundTo(model.lengthWeightA * lengthCm ** model.lengthWeightB, 3)

/** 個体差（±variance）を掛ける。 */
const applyIndividualVariance = (base: number, random: RandomSource, variance: number): number =>
  base * (1 + (random.next() * 2 - 1) * variance)

export type CreateFightingFishOptions = {
  readonly species: FishSpecies
  readonly random: RandomSource
  readonly individualSeed: string
  readonly tuning?: FishingTuning
}

export const createFightingFish = (options: CreateFightingFishOptions): FightingFish => {
  const { species, random, individualSeed } = options
  const tuning = options.tuning ?? DEFAULT_FISHING_TUNING
  const variance = tuning.individualVariance

  // 乱数の消費順は固定。ここを変えると seed 再現性が変わる。
  const power = clamp(
    applyIndividualVariance(species.fightProfile.strength, random, variance),
    0,
    1,
  )
  const speed = clamp(applyIndividualVariance(species.fightProfile.speed, random, variance), 0, 1)
  const staminaMax = clamp(
    applyIndividualVariance(species.fightProfile.stamina, random, variance),
    0.05,
    1,
  )
  const lengthCm = sampleLengthCm(species.lengthModel, random)

  const weightKg =
    species.weightModel === undefined ? undefined : estimateWeightKg(species.weightModel, lengthCm)

  return {
    speciesId: species.id,
    name: species.japaneseName,
    individualSeed,
    lengthCm,
    ...(weightKg === undefined ? {} : { weightKg }),
    power,
    speed,
    staminaMax,
  }
}
