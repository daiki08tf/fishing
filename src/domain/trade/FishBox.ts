import type { FishTrait } from '../fish/FishTrait'
import type { FishIndividual } from '../fish/FishIndividual'
import type { FishIndividualId, FishingSpotId, FishSpeciesId, RegionId } from '../ids'
import type { WorldTime } from '../world/WorldTime'

/**
 * Fish Box（Phase 13）。
 *
 * LANDED した魚を「持ち帰る（Keep）」と選んだときだけ入る。Codex / XP は
 * Keep / Release に関係なく LANDED の時点で既に確定している（catch/resolveCatch）。
 *
 * FishSpecies の性能値そのものは複製しない。Content から解決できるものは
 * 売却時に Content（SpeciesTradeProfile）を参照する。
 */
export type KeptCatch = {
  readonly catchId: FishIndividualId
  readonly speciesId: FishSpeciesId
  readonly lengthCm: number
  readonly weightKg: number
  readonly condition: number
  readonly percentile: number
  readonly traits: readonly FishTrait[]
  readonly caughtAt: WorldTime
  readonly sourceSpotId: FishingSpotId
  readonly sourceRegionId: RegionId
}

export type FishBoxState = readonly KeptCatch[]

export const emptyFishBoxState = (): FishBoxState => []

export const toKeptCatch = (input: {
  readonly individual: FishIndividual
  readonly caughtAt: WorldTime
  readonly sourceSpotId: FishingSpotId
  readonly sourceRegionId: RegionId
}): KeptCatch => ({
  catchId: input.individual.id,
  speciesId: input.individual.speciesId,
  lengthCm: input.individual.lengthCm,
  weightKg: input.individual.weightKg,
  condition: input.individual.condition,
  percentile: input.individual.percentile ?? 0,
  traits: input.individual.traits,
  caughtAt: input.caughtAt,
  sourceSpotId: input.sourceSpotId,
  sourceRegionId: input.sourceRegionId,
})

/** 同じ catchId が二重に入らないようにする。既に入っていれば変化しない。 */
export const addKeptCatch = (fishBox: FishBoxState, entry: KeptCatch): FishBoxState =>
  fishBox.some((existing) => existing.catchId === entry.catchId) ? fishBox : [...fishBox, entry]

export const removeKeptCatches = (
  fishBox: FishBoxState,
  catchIds: readonly FishIndividualId[],
): FishBoxState => {
  const remove = new Set<string>(catchIds.map((id) => String(id)))
  return fishBox.filter((entry) => !remove.has(String(entry.catchId)))
}
