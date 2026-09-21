import type { FishSpecies } from '../../domain/fish/FishSpecies'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import fishingSpotData from '../data/fishing-spots/phase1-sample-spot.json'
import fishSpeciesData from '../data/fish-species/phase1-sample-fish.json'
import { fishingSpotSchema, fishSpeciesSchema } from '../schema'

/**
 * Phase 1 の Vertical Slice が使う組み込みコンテンツ。
 *
 * ここに置く魚種・釣り場は**検証用のサンプル**であり、現実の魚や釣り場を
 * 表すものではない（名前も数値も暫定）。現実データは Phase 2 / Phase 4 で投入する。
 *
 * Content は必ず Zod スキーマを通してから Domain へ渡す。
 * 実行時にも検証することで、`npm run validate:content` と同じ規則が
 * ブラウザ側でも保証される。
 */

export type Phase1SampleContent = {
  readonly species: FishSpecies
  readonly spot: FishingSpot
  /** Spot の fishTable にある出現度。Encounter の入力になる。 */
  readonly presence: number
}

export class ContentValidationError extends Error {
  readonly issues: readonly string[]

  constructor(kind: string, issues: readonly string[]) {
    super(`invalid ${kind} content: ${issues.join(', ')}`)
    this.name = 'ContentValidationError'
    this.issues = issues
  }
}

const formatIssues = (error: {
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[]
}): readonly string[] =>
  error.issues.map(
    (issue) => `${issue.path.map((segment) => String(segment)).join('.')}: ${issue.message}`,
  )

export const loadPhase1SampleContent = (): Phase1SampleContent => {
  const species = fishSpeciesSchema.safeParse(fishSpeciesData)

  if (!species.success) {
    throw new ContentValidationError('fish-species', formatIssues(species.error))
  }

  const spot = fishingSpotSchema.safeParse(fishingSpotData)

  if (!spot.success) {
    throw new ContentValidationError('fishing-spots', formatIssues(spot.error))
  }

  const occurrence = spot.data.fishTable.find((entry) => entry.speciesId === species.data.id)

  if (occurrence === undefined) {
    throw new ContentValidationError('fishing-spots', [
      `spot ${spot.data.id} has no fishTable entry for ${species.data.id}`,
    ])
  }

  return { species: species.data, spot: spot.data, presence: occurrence.basePresence }
}
