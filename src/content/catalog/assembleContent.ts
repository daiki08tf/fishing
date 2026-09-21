import type { EncounterCandidate } from '../../domain/encounter/encounterEngine'
import type { FishSpecies } from '../../domain/fish/FishSpecies'
import type { GearItem } from '../../domain/gear/Gear'
import type { BrandDefinition } from '../../domain/gear/Brand'
import type { FishingMethod } from '../../domain/method/FishingMethod'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import type { ShopItem } from '../../domain/shop/ShopItem'
import {
  brandSchema,
  fishingSpotSchema,
  fishSpeciesSchema,
  gearItemSchema,
  methodSchema,
  shopItemSchema,
} from '../schema'
import { validateContentReferences } from './references'

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
  readonly shopItems: readonly ShopItem[]
  /** Phase 6: Rod / Reel / Line / Leader / Hook / Lure / Bait。 */
  readonly gear: readonly GearItem[]
  readonly gearById: Readonly<Record<string, GearItem>>
  /** Phase 6: 釣法（lure / light_lure / bait / bottom ...）。 */
  readonly methods: readonly FishingMethod[]
  readonly methodById: Readonly<Record<string, FishingMethod>>
  /** Phase 6: 架空ブランド（表示・整理のみ。性能を持たない）。 */
  readonly brands: readonly BrandDefinition[]
  readonly brandById: Readonly<Record<string, BrandDefinition>>
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

const parseShopItem = (source: string, value: unknown): ShopItem => {
  const parsed = shopItemSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'shop-items',
      formatIssues('shop-items', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseGear = (source: string, value: unknown): GearItem => {
  const parsed = gearItemSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError('gear', formatIssues('gear', source, parsed.error.issues))
  }

  return parsed.data
}

const parseMethod = (source: string, value: unknown): FishingMethod => {
  const parsed = methodSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'methods',
      formatIssues('methods', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseBrand = (source: string, value: unknown): BrandDefinition => {
  const parsed = brandSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError('brands', formatIssues('brands', source, parsed.error.issues))
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
  readonly shopItems?: readonly ContentSource[]
  readonly gear?: readonly ContentSource[]
  readonly methods?: readonly ContentSource[]
  readonly brands?: readonly ContentSource[]
}): BuiltInContent => {
  const species = input.species.map((entry) => parseSpecies(entry.source, entry.value))
  const spots = input.spots.map((entry) => parseSpot(entry.source, entry.value))
  const shopItems = (input.shopItems ?? []).map((entry) => parseShopItem(entry.source, entry.value))
  const gear = (input.gear ?? []).map((entry) => parseGear(entry.source, entry.value))
  const methods = (input.methods ?? []).map((entry) => parseMethod(entry.source, entry.value))
  const brands = (input.brands ?? []).map((entry) => parseBrand(entry.source, entry.value))
  const primarySpot = spots[0]

  if (primarySpot === undefined) {
    throw new ContentValidationError('fishing-spots', ['no spot content was found'])
  }

  const speciesById: Record<string, FishSpecies> = {}
  const gearById: Record<string, GearItem> = {}
  const methodById: Record<string, FishingMethod> = {}
  const brandById: Record<string, BrandDefinition> = {}

  for (const entry of species) {
    speciesById[String(entry.id)] = entry
  }

  for (const entry of gear) {
    gearById[String(entry.id)] = entry
  }

  for (const entry of methods) {
    methodById[entry.id] = entry
  }

  for (const entry of brands) {
    brandById[String(entry.id)] = entry
  }

  // 参照切れは実行時カタログの入口で止める（Domain へ不正な Content を渡さない）。
  const referenceIssues = validateContentReferences({
    species,
    spots,
    shopItems,
    gear,
    methods,
    brands,
  })

  if (referenceIssues.length > 0) {
    throw new ContentValidationError(
      'content-references',
      referenceIssues.map((issue) => `${issue.path}: ${issue.message}`),
    )
  }

  return {
    species,
    speciesById,
    spots,
    shopItems,
    gear,
    gearById,
    methods,
    methodById,
    brands,
    brandById,
    primarySpot,
    encounters: buildEncounters(primarySpot, speciesById),
  }
}
