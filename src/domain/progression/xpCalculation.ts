import type { FishTrait } from '../fish/FishTrait'
import type { FishSpeciesId } from '../ids'
import { decayMultiplier, type DecayRelief } from './repetitionDecay'
import { DEFAULT_PROGRESSION_TUNING, type ProgressionTuning } from './ProgressionTuning'

/**
 * 捕獲 1 件の XP 計算（PROGRESSION.md §6 / §7）。
 *
 * 概念式:
 *
 *   XP = Base × Size Modifier × Challenge Modifier + Discovery Bonuses
 *
 * 反復減衰は「倍率のかかる部分」にだけ適用する。
 * 初捕獲・自己記録・Trophy などの Discovery Bonus は減衰させない
 * （新しい挑戦が常に価値を持つようにするため）。
 *
 * 倍率の積み重ねで異常値にならないよう、Challenge 倍率と合計 XP に上限を置く。
 */

export type XpFactor = {
  readonly label: string
  readonly value: number
}

export type XpBreakdown = {
  readonly base: number
  readonly sizeMultiplier: number
  readonly sizeBand: string
  readonly challengeMultiplier: number
  readonly decayMultiplier: number
  readonly discoveryBonus: number
  readonly total: number
  readonly factors: readonly XpFactor[]
}

export type CatchXpInput = {
  readonly species: {
    readonly id: FishSpeciesId
    readonly rarity: number
  }
  /** 同種サイズ分布での百分位（0〜100）。 */
  readonly percentile: number
  readonly traits: readonly FishTrait[]
  readonly firstCatch: boolean
  readonly personalRecord: boolean
  readonly newSpot: boolean
  readonly newMethod: boolean
  /** 今回を含めた、その魚種の通算捕獲数。 */
  readonly repetitionCount: number
  readonly tuning?: ProgressionTuning
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** サイズ上位率による倍率。 */
export const sizeMultiplierFor = (
  percentile: number,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): { readonly multiplier: number; readonly label: string } => {
  for (const band of tuning.sizeBands) {
    if (percentile >= band.minPercentile) {
      return { multiplier: band.multiplier, label: band.label }
    }
  }

  return { multiplier: 1, label: 'normal' }
}

/** 魚種の希少度から Base XP を求める。 */
export const baseXpForSpecies = (
  rarity: number,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => Math.round(tuning.baseCatchXp * (1 + tuning.rarityXpStep * Math.max(0, rarity - 1)))

/** 個体 Trait による Challenge 倍率（上限あり）。 */
export const challengeMultiplierFor = (
  traits: readonly FishTrait[],
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => {
  let multiplier = 1

  for (const trait of traits) {
    multiplier *= tuning.challengeTraitMultipliers[trait]
  }

  return clamp(multiplier, 1, tuning.maxChallengeMultiplier)
}

export const decayReliefFor = (input: CatchXpInput): DecayRelief => ({
  firstCatch: input.firstCatch,
  personalRecord: input.personalRecord,
  trophy: input.traits.includes('trophy'),
  highPercentile: input.percentile >= 99,
  newSpot: input.newSpot,
  newMethod: input.newMethod,
})

export const calculateCatchXp = (input: CatchXpInput): XpBreakdown => {
  const tuning = input.tuning ?? DEFAULT_PROGRESSION_TUNING
  const base = baseXpForSpecies(input.species.rarity, tuning)
  const size = sizeMultiplierFor(input.percentile, tuning)
  const challenge = challengeMultiplierFor(input.traits, tuning)
  const decay = decayMultiplier({
    count: input.repetitionCount,
    relief: decayReliefFor(input),
    tuning,
  })

  const factors: XpFactor[] = []

  if (input.firstCatch) {
    factors.push({ label: 'first catch', value: tuning.firstCatchBonus })
  }
  if (input.personalRecord) {
    factors.push({ label: 'personal record', value: tuning.personalRecordBonus })
  }
  if (input.newSpot) {
    factors.push({ label: 'new spot', value: tuning.newSpotBonus })
  }
  if (input.newMethod) {
    factors.push({ label: 'new method', value: tuning.newMethodBonus })
  }
  if (input.traits.includes('trophy')) {
    factors.push({ label: 'trophy', value: tuning.trophyBonus })
  }

  const otherTraits = input.traits.filter((trait) => trait !== 'trophy').length

  if (otherTraits > 0) {
    factors.push({ label: 'traits', value: tuning.traitBonus * otherTraits })
  }

  const discoveryBonus = factors.reduce((total, factor) => total + factor.value, 0)
  const raw = base * size.multiplier * challenge * decay + discoveryBonus
  const total = Math.round(clamp(raw, 0, tuning.maxCatchXp))

  return {
    base,
    sizeMultiplier: size.multiplier,
    sizeBand: size.label,
    challengeMultiplier: challenge,
    decayMultiplier: decay,
    discoveryBonus,
    total,
    factors,
  }
}
