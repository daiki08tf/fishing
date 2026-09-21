import type { FishIndividual } from '../fish/FishIndividual'
import type { FishTrait } from '../fish/FishTrait'
import type { CodexState, FishRecordEntry, SpeciesRecord } from './FishRecord'

/**
 * 捕獲記録の更新。純粋関数として実装する。
 *
 * UI は「更新されたか」「自己記録か」を知るだけでよく、
 * 記録のルール（何をもって自己記録とするか）はここに閉じる。
 */

export type CatchRecordOutcome = {
  readonly state: CodexState
  readonly isFirstCatchOfSpecies: boolean
  readonly isPersonalBest: boolean
  readonly updatedLargestLength: boolean
  readonly updatedHeaviestWeight: boolean
  readonly newTraits: readonly FishTrait[]
  readonly record: SpeciesRecord
}

export const toRecordEntry = (
  individual: FishIndividual,
  capturedAt?: string,
): FishRecordEntry => ({
  individualId: individual.id,
  speciesId: individual.speciesId,
  lengthCm: individual.lengthCm,
  weightKg: individual.weightKg,
  condition: individual.condition,
  percentile: individual.percentile ?? 0,
  traits: individual.traits,
  ...(capturedAt === undefined ? {} : { capturedAt }),
})

const mergeTraits = (
  existing: readonly FishTrait[],
  incoming: readonly FishTrait[],
): readonly FishTrait[] => {
  const merged = [...existing]

  for (const trait of incoming) {
    if (!merged.includes(trait)) {
      merged.push(trait)
    }
  }

  return merged
}

/**
 * 1 匹の捕獲を記録する。
 *
 * 自己記録（personalBest）は**百分位が高い個体**を優先する。
 * サイズ分布上での珍しさが、その個体の価値だからである
 * （GAME_DESIGN.md §5.1 の「魚種レア度と個体レア度の分離」に対応）。
 */
export const recordCatch = (state: CodexState, entry: FishRecordEntry): CatchRecordOutcome => {
  const key = String(entry.speciesId)
  const existing = state.species[key]
  const isFirstCatchOfSpecies = existing === undefined

  if (existing === undefined) {
    const record: SpeciesRecord = {
      speciesId: entry.speciesId,
      catchCount: 1,
      largestLengthCm: entry.lengthCm,
      heaviestWeightKg: entry.weightKg,
      bestPercentile: entry.percentile,
      caughtTraits: [...entry.traits],
      personalBest: entry,
    }

    return {
      state: { species: { ...state.species, [key]: record } },
      isFirstCatchOfSpecies: true,
      isPersonalBest: true,
      updatedLargestLength: true,
      updatedHeaviestWeight: true,
      newTraits: [...entry.traits],
      record,
    }
  }

  const isPersonalBest = entry.percentile > existing.bestPercentile
  const updatedLargestLength = entry.lengthCm > existing.largestLengthCm
  const updatedHeaviestWeight = entry.weightKg > existing.heaviestWeightKg
  const newTraits = entry.traits.filter((trait) => !existing.caughtTraits.includes(trait))

  const record: SpeciesRecord = {
    speciesId: existing.speciesId,
    catchCount: existing.catchCount + 1,
    largestLengthCm: updatedLargestLength ? entry.lengthCm : existing.largestLengthCm,
    heaviestWeightKg: updatedHeaviestWeight ? entry.weightKg : existing.heaviestWeightKg,
    bestPercentile: isPersonalBest ? entry.percentile : existing.bestPercentile,
    caughtTraits: mergeTraits(existing.caughtTraits, entry.traits),
    personalBest: isPersonalBest ? entry : existing.personalBest,
  }

  return {
    state: { species: { ...state.species, [key]: record } },
    isFirstCatchOfSpecies,
    isPersonalBest,
    updatedLargestLength,
    updatedHeaviestWeight,
    newTraits,
    record,
  }
}

/** 記録済みの魚種数。 */
export const recordedSpeciesCount = (state: CodexState): number => Object.keys(state.species).length
