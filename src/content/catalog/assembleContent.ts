import type { EncounterCandidate } from '../../domain/encounter/encounterEngine'
import type { FishSpecies } from '../../domain/fish/FishSpecies'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import { fishingSpotSchema, fishSpeciesSchema } from '../schema'

/**
 * 検証済みの Content を Domain が使える形に組み立てる。
 *
 * ブラウザ（import.meta.glob）と Node（fs）の両方から使うため、
 * ここには環境依存の処理を置かない。
 */

export type BuiltInContent = {
  readonly species: readonly FishSpecies[]
  readonly speciesById: Readonly<Record<string, FishSpecies>>
  readonly spots: readonly FishingSpot[]
  /** Phase 2 では Spot は 1 つだけ。Phase 4 で地域と複数 Spot を扱う。 */
  readonly primarySpot: FishingSpot
  /** primarySpot の fishTable から作った Encounter 候補。 */
  readonly encounters: readonly EncounterCandidate[]
}

export class ContentValidationError extends Error {
  readonly issues: readonly string[]

  constructor(kind: string, issues: readonly string[]) {
    super(`invalid ${kind} content: ${issues.join(', ')}`)
    this.name = 'ContentValidationError'
    this.issues = issues
  }
}

type ValidationIssue = { readonly path: readonly PropertyKey[]; readonly message: string }

const formatIssues = (
  kind: string,
  source: string,
  issues: readonly ValidationIssue[],
): readonly string[] =>
  issues.map(
    (issue) =>
      `${kind} ${source}#${issue.path.map((segment) => String(segment)).join('.')}: ${issue.message}`,
  )

const parseSpecies = (source: string, value: unknown): FishSpecies => {
  const parsed = fishSpeciesSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'fish-species',
      formatIssues('fish-species', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseSpot = (source: string, value: unknown): FishingSpot => {
  const parsed = fishingSpotSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'fishing-spots',
      formatIssues('fishing-spots', source, parsed.error.issues),
    )
  }

  return parsed.data
}

/** Spot の fishTable を Encounter 候補へ変換する。未知の speciesId は Content の誤り。 */
const buildEncounters = (
  spot: FishingSpot,
  speciesById: Readonly<Record<string, FishSpecies>>,
): readonly EncounterCandidate[] => {
  const candidates: EncounterCandidate[] = []

  for (const occurrence of spot.fishTable) {
    const species = speciesById[String(occurrence.speciesId)]

    if (species === undefined) {
      throw new ContentValidationError('fishing-spots', [
        `spot ${spot.id} references unknown speciesId ${String(occurrence.speciesId)}`,
      ])
    }

    candidates.push({ species, presence: occurrence.basePresence })
  }

  return candidates
}

export type ContentSource = {
  readonly source: string
  readonly value: unknown
}

export const assembleBuiltInContent = (input: {
  readonly species: readonly ContentSource[]
  readonly spots: readonly ContentSource[]
}): BuiltInContent => {
  const species = input.species.map((entry) => parseSpecies(entry.source, entry.value))
  const spots = input.spots.map((entry) => parseSpot(entry.source, entry.value))
  const primarySpot = spots[0]

  if (primarySpot === undefined) {
    throw new ContentValidationError('fishing-spots', ['no spot content was found'])
  }

  const speciesById: Record<string, FishSpecies> = {}

  for (const entry of species) {
    speciesById[String(entry.id)] = entry
  }

  return {
    species,
    speciesById,
    spots,
    primarySpot,
    encounters: buildEncounters(primarySpot, speciesById),
  }
}
