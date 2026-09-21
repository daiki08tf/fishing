import type { FishIndividual } from '../fish/FishIndividual'
import type { FishSpecies } from '../fish/FishSpecies'
import type { TraitModifiers } from '../fish/fishTraits'
import { lengthModelMedian } from '../fish/lengthModel'
import { estimateStandardWeightKg } from '../fish/weightModel'
import type { RandomSource } from '../rng/RandomSource'
import type { FightingFish } from './FightingFish'
import { DEFAULT_FISHING_TUNING, type FishingTuning } from './FishingTuning'

/**
 * 個体からファイト特性を導出する。
 *
 * サイズ・体重・コンディション・Trait の決定は
 * `generateFishIndividual` の責務であり、ここでは扱わない。
 * ここが答えるのは「その個体がどう戦うか」だけである。
 *
 * Trait の効果は解決済みの TraitModifiers として受け取る。
 * したがって Trait が増えても、この関数と FishingEngine は変わらない。
 *
 * 乱数の消費順は固定（power → speed → stamina）。
 * 途中で変えると seed 再現性が壊れる。
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** 個体差（±variance）を掛ける。 */
const applyIndividualVariance = (base: number, random: RandomSource, variance: number): number =>
  base * (1 + (random.next() * 2 - 1) * variance)

export type CreateFightingFishOptions = {
  readonly species: FishSpecies
  readonly individual: FishIndividual
  /** Trait から合成済みの倍率（combineTraitModifiers の結果）。 */
  readonly traitModifiers: TraitModifiers
  readonly random: RandomSource
  readonly tuning?: FishingTuning
}

export const createFightingFish = (options: CreateFightingFishOptions): FightingFish => {
  const { species, individual, traitModifiers, random } = options
  const tuning = options.tuning ?? DEFAULT_FISHING_TUNING
  const variance = tuning.individualVariance

  // 乱数の消費順は固定。ここを変えると seed 再現性が変わる。
  const power = clamp(
    applyIndividualVariance(species.fightProfile.strength, random, variance) *
      traitModifiers.powerMultiplier,
    0,
    1,
  )
  const speed = clamp(
    applyIndividualVariance(species.fightProfile.speed, random, variance) *
      traitModifiers.speedMultiplier,
    0,
    1,
  )
  const staminaMax = clamp(
    applyIndividualVariance(species.fightProfile.stamina, random, variance) *
      traitModifiers.staminaMultiplier,
    0.05,
    1,
  )

  /*
   * Phase 9: 大きい個体ほど強く引く。
   *
   * 基準（体長分布の中央値）の体重を 1.0 とし、同じ魚種でも大型個体は
   * テンションを上げやすく、疲れにくい。これにより「軽いタックルでも獲れるが
   * ラインブレイク / フックアウトが増える」が成立する。
   * 魚種名・国・季節は使わない（個体の数値だけを見る）。
   */
  const referenceWeightKg = estimateStandardWeightKg(
    species.weightModel,
    lengthModelMedian(species.lengthModel),
  )
  const sizeRatio =
    referenceWeightKg > 0 ? Math.max(0.2, individual.weightKg / referenceWeightKg) : 1
  const pullMultiplier = clamp(
    1 + tuning.bigFishPullStrength * (sizeRatio - 1),
    tuning.bigFishPullMin,
    tuning.bigFishPullMax,
  )
  const enduranceMultiplier = clamp(1 + tuning.bigFishEnduranceStrength * (sizeRatio - 1), 0.8, 2.2)

  return {
    individual,
    speciesName: species.japaneseName,
    power,
    speed,
    staminaMax,
    pullMultiplier,
    enduranceMultiplier,
    modifiers: traitModifiers,
  }
}
