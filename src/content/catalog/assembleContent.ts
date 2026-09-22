import type { EncounterCandidate } from '../../domain/encounter/encounterEngine'
import type { FishSpecies } from '../../domain/fish/FishSpecies'
import type { GearItem } from '../../domain/gear/Gear'
import type { BrandDefinition } from '../../domain/gear/Brand'
import type { GearSeries } from '../../domain/gear/GearSeries'
import type { FishingMethod } from '../../domain/method/FishingMethod'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import type { ShopItem } from '../../domain/shop/ShopItem'
import type { TransportDefinition } from '../../domain/access/Transport'
import type { ExpeditionDefinition } from '../../domain/expedition/Expedition'
import type { Country, RegionDefinition } from '../../domain/world/Region'
import type { BuyerDefinition } from '../../domain/trade/Buyer'
import type { SpeciesTradeProfile } from '../../domain/trade/SpeciesTradeProfile'
import type { ContactReward } from '../../domain/trade/ContactReward'
import {
  brandSchema,
  buyerSchema,
  contactRewardSchema,
  countrySchema,
  expeditionSchema,
  fishingSpotSchema,
  fishSpeciesSchema,
  gearItemSchema,
  gearSeriesSchema,
  methodSchema,
  regionSchema,
  shopItemSchema,
  speciesTradeProfileSchema,
  transportSchema,
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
  readonly transports: readonly TransportDefinition[]
  readonly transportById: Readonly<Record<string, TransportDefinition>>
  /** Phase 8: 世界階層（Country / Region）と遠征定義。 */
  readonly countries: readonly Country[]
  readonly countryById: Readonly<Record<string, Country>>
  readonly regions: readonly RegionDefinition[]
  readonly regionById: Readonly<Record<string, RegionDefinition>>
  readonly expeditions: readonly ExpeditionDefinition[]
  readonly expeditionById: Readonly<Record<string, ExpeditionDefinition>>
  /** Phase 13: 買取先 / 魚種の取引状態 / Trust 報酬。 */
  readonly buyers: readonly BuyerDefinition[]
  readonly buyerById: Readonly<Record<string, BuyerDefinition>>
  readonly speciesTradeProfiles: readonly SpeciesTradeProfile[]
  readonly speciesTradeProfileBySpeciesId: Readonly<Record<string, SpeciesTradeProfile>>
  readonly contactRewards: readonly ContactReward[]
  /** Phase 6: Rod / Reel / Line / Leader / Hook / Lure / Bait。 */
  readonly gear: readonly GearItem[]
  readonly gearById: Readonly<Record<string, GearItem>>
  /** Phase 6: 釣法（lure / light_lure / bait / bottom ...）。 */
  readonly methods: readonly FishingMethod[]
  readonly methodById: Readonly<Record<string, FishingMethod>>
  /** Phase 6: 架空ブランド（表示・整理のみ。性能を持たない）。 */
  readonly brands: readonly BrandDefinition[]
  readonly brandById: Readonly<Record<string, BrandDefinition>>
  /** Phase 6.5: Product Series（Brand → Series → Model）。 */
  readonly gearSeries: readonly GearSeries[]
  readonly gearSeriesById: Readonly<Record<string, GearSeries>>
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

const parseTransport = (source: string, value: unknown): TransportDefinition => {
  const parsed = transportSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'transports',
      formatIssues('transports', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseCountry = (source: string, value: unknown): Country => {
  const parsed = countrySchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'countries',
      formatIssues('countries', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseRegion = (source: string, value: unknown): RegionDefinition => {
  const parsed = regionSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'regions',
      formatIssues('regions', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseExpedition = (source: string, value: unknown): ExpeditionDefinition => {
  const parsed = expeditionSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'expeditions',
      formatIssues('expeditions', source, parsed.error.issues),
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

const parseBuyer = (source: string, value: unknown): BuyerDefinition => {
  const parsed = buyerSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError('buyers', formatIssues('buyers', source, parsed.error.issues))
  }

  return parsed.data
}

const parseSpeciesTradeProfile = (source: string, value: unknown): SpeciesTradeProfile => {
  const parsed = speciesTradeProfileSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'species-trade-profiles',
      formatIssues('species-trade-profiles', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseContactReward = (source: string, value: unknown): ContactReward => {
  const parsed = contactRewardSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'contact-rewards',
      formatIssues('contact-rewards', source, parsed.error.issues),
    )
  }

  return parsed.data
}

const parseGearSeries = (source: string, value: unknown): GearSeries => {
  const parsed = gearSeriesSchema.safeParse(value)

  if (!parsed.success) {
    throw new ContentValidationError(
      'gear-series',
      formatIssues('gear-series', source, parsed.error.issues),
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
  readonly shopItems?: readonly ContentSource[]
  readonly transports?: readonly ContentSource[]
  readonly countries?: readonly ContentSource[]
  readonly regions?: readonly ContentSource[]
  readonly expeditions?: readonly ContentSource[]
  readonly buyers?: readonly ContentSource[]
  readonly speciesTradeProfiles?: readonly ContentSource[]
  readonly contactRewards?: readonly ContentSource[]
  readonly gear?: readonly ContentSource[]
  readonly gearSeries?: readonly ContentSource[]
  readonly methods?: readonly ContentSource[]
  readonly brands?: readonly ContentSource[]
}): BuiltInContent => {
  const species = input.species.map((entry) => parseSpecies(entry.source, entry.value))
  const spots = input.spots.map((entry) => parseSpot(entry.source, entry.value))
  const shopItems = (input.shopItems ?? []).map((entry) => parseShopItem(entry.source, entry.value))
  const transports = (input.transports ?? []).map((entry) =>
    parseTransport(entry.source, entry.value),
  )
  const countries = (input.countries ?? []).map((entry) => parseCountry(entry.source, entry.value))
  const regions = (input.regions ?? []).map((entry) => parseRegion(entry.source, entry.value))
  const expeditions = (input.expeditions ?? []).map((entry) =>
    parseExpedition(entry.source, entry.value),
  )
  const buyers = (input.buyers ?? []).map((entry) => parseBuyer(entry.source, entry.value))
  const speciesTradeProfiles = (input.speciesTradeProfiles ?? []).map((entry) =>
    parseSpeciesTradeProfile(entry.source, entry.value),
  )
  const contactRewards = (input.contactRewards ?? []).map((entry) =>
    parseContactReward(entry.source, entry.value),
  )
  const gear = (input.gear ?? []).map((entry) => parseGear(entry.source, entry.value))
  const gearSeries = (input.gearSeries ?? []).map((entry) =>
    parseGearSeries(entry.source, entry.value),
  )
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
  const gearSeriesById: Record<string, GearSeries> = {}
  const transportById: Record<string, TransportDefinition> = {}
  const countryById: Record<string, Country> = {}
  const regionById: Record<string, RegionDefinition> = {}
  const expeditionById: Record<string, ExpeditionDefinition> = {}
  const buyerById: Record<string, BuyerDefinition> = {}
  const speciesTradeProfileBySpeciesId: Record<string, SpeciesTradeProfile> = {}

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

  for (const entry of gearSeries) {
    gearSeriesById[entry.id] = entry
  }

  for (const entry of transports) {
    transportById[String(entry.id)] = entry
  }

  for (const entry of countries) {
    countryById[String(entry.id)] = entry
  }

  for (const entry of regions) {
    regionById[String(entry.id)] = entry
  }

  for (const entry of expeditions) {
    expeditionById[String(entry.id)] = entry
  }

  for (const entry of buyers) {
    buyerById[String(entry.id)] = entry
  }

  for (const entry of speciesTradeProfiles) {
    speciesTradeProfileBySpeciesId[String(entry.speciesId)] = entry
  }

  // 参照切れは実行時カタログの入口で止める（Domain へ不正な Content を渡さない）。
  const referenceIssues = validateContentReferences({
    species,
    spots,
    shopItems,
    gear,
    methods,
    brands,
    gearSeries,
    transports,
    countries,
    regions,
    expeditions,
    buyers,
    speciesTradeProfiles,
    contactRewards,
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
    transports,
    transportById,
    countries,
    countryById,
    regions,
    regionById,
    expeditions,
    expeditionById,
    buyers,
    buyerById,
    speciesTradeProfiles,
    speciesTradeProfileBySpeciesId,
    contactRewards,
    gear,
    gearById,
    methods,
    methodById,
    brands,
    brandById,
    gearSeries,
    gearSeriesById,
    primarySpot,
    encounters: buildEncounters(primarySpot, speciesById),
  }
}
