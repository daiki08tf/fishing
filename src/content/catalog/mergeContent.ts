import type { EncounterCandidate } from '../../domain/encounter/encounterEngine'
import type { BrandDefinition } from '../../domain/gear/Brand'
import type { GearItem } from '../../domain/gear/Gear'
import type { GearSeries } from '../../domain/gear/GearSeries'
import type { FishSpecies } from '../../domain/fish/FishSpecies'
import type { FishingMethod } from '../../domain/method/FishingMethod'
import type { ShopItem } from '../../domain/shop/ShopItem'
import type { BuyerDefinition } from '../../domain/trade/Buyer'
import type { ContactDefinition } from '../../domain/trade/Contact'
import type { ContactReward } from '../../domain/trade/ContactReward'
import type { SpeciesTradeProfile } from '../../domain/trade/SpeciesTradeProfile'
import type { TransportDefinition } from '../../domain/access/Transport'
import type { ExpeditionDefinition } from '../../domain/expedition/Expedition'
import type { Country, RegionDefinition } from '../../domain/world/Region'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import type { BuiltInContent } from './assembleContent'

/**
 * Content の「束」と合成（Phase 15）。
 *
 * Content Pack は少しずつ読み込まれるので、Domain が使う形（`BuiltInContent`）を
 * **増分で組み立てられる**必要がある。ここは純粋な合成だけで、
 * 参照検証は行わない（検証は node 側の assembleBuiltInContent / validate:content が担当。
 * 途中状態では「まだ読んでいない pack」を参照切れと誤判定してしまうため）。
 */

export type ContentBuckets = {
  readonly species: readonly FishSpecies[]
  readonly spots: readonly FishingSpot[]
  readonly shopItems: readonly ShopItem[]
  readonly transports: readonly TransportDefinition[]
  readonly countries: readonly Country[]
  readonly regions: readonly RegionDefinition[]
  readonly expeditions: readonly ExpeditionDefinition[]
  readonly buyers: readonly BuyerDefinition[]
  /** Phase 17C: 買い取りをしない汎用 Contact（船長・ガイドなど）。 */
  readonly contacts: readonly ContactDefinition[]
  readonly speciesTradeProfiles: readonly SpeciesTradeProfile[]
  readonly contactRewards: readonly ContactReward[]
  readonly gear: readonly GearItem[]
  readonly gearSeries: readonly GearSeries[]
  readonly methods: readonly FishingMethod[]
  readonly brands: readonly BrandDefinition[]
}

export const emptyContentBuckets = (): ContentBuckets => ({
  species: [],
  spots: [],
  shopItems: [],
  transports: [],
  countries: [],
  regions: [],
  expeditions: [],
  buyers: [],
  contacts: [],
  speciesTradeProfiles: [],
  contactRewards: [],
  gear: [],
  gearSeries: [],
  methods: [],
  brands: [],
})

export type ContentBucketKey = keyof ContentBuckets

const mergeList = <T>(
  left: readonly T[],
  right: readonly T[],
  keyOf: (value: T) => string,
): readonly T[] => {
  const seen = new Set(left.map(keyOf))
  const merged = [...left]

  for (const value of right) {
    const key = keyOf(value)

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(value)
  }

  return merged
}

/** 同じ Content を 2 回入れても重複しない（id が同じものは先勝ち）。 */
export const mergeContentBuckets = (base: ContentBuckets, add: ContentBuckets): ContentBuckets => ({
  species: mergeList(base.species, add.species, (entry) => String(entry.id)),
  spots: mergeList(base.spots, add.spots, (entry) => String(entry.id)),
  shopItems: mergeList(base.shopItems, add.shopItems, (entry) => String(entry.id)),
  transports: mergeList(base.transports, add.transports, (entry) => String(entry.id)),
  countries: mergeList(base.countries, add.countries, (entry) => String(entry.id)),
  regions: mergeList(base.regions, add.regions, (entry) => String(entry.id)),
  expeditions: mergeList(base.expeditions, add.expeditions, (entry) => String(entry.id)),
  buyers: mergeList(base.buyers, add.buyers, (entry) => String(entry.id)),
  contacts: mergeList(base.contacts, add.contacts, (entry) => String(entry.id)),
  speciesTradeProfiles: mergeList(base.speciesTradeProfiles, add.speciesTradeProfiles, (entry) =>
    String(entry.speciesId),
  ),
  contactRewards: mergeList(base.contactRewards, add.contactRewards, (entry) => String(entry.id)),
  gear: mergeList(base.gear, add.gear, (entry) => String(entry.id)),
  gearSeries: mergeList(base.gearSeries, add.gearSeries, (entry) => entry.id),
  methods: mergeList(base.methods, add.methods, (entry) => entry.id),
  brands: mergeList(base.brands, add.brands, (entry) => String(entry.id)),
})

const indexBy = <T>(
  entries: readonly T[],
  keyOf: (value: T) => string,
): Readonly<Record<string, T>> => {
  const result: Record<string, T> = {}

  for (const entry of entries) {
    result[keyOf(entry)] = entry
  }

  return result
}

const buildEncounters = (
  spot: FishingSpot,
  speciesById: Readonly<Record<string, FishSpecies>>,
): readonly EncounterCandidate[] =>
  spot.fishTable.flatMap((occurrence) => {
    const species = speciesById[String(occurrence.speciesId)]

    return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
  })

/**
 * 束を Domain が使う形へ合成する。
 * `primarySpot` は「最初の Spot」（従来どおり）。Spot が 1 つも無いときは例外。
 */
export const toBuiltInContent = (
  buckets: ContentBuckets,
  options: { readonly primarySpotId?: string } = {},
): BuiltInContent => {
  const sortedSpots = [...buckets.spots].sort((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  )
  const primarySpot =
    options.primarySpotId === undefined
      ? sortedSpots[0]
      : (sortedSpots.find((spot) => String(spot.id) === options.primarySpotId) ?? sortedSpots[0])

  if (primarySpot === undefined) {
    throw new Error('no spot content is loaded yet')
  }

  const speciesById = indexBy(buckets.species, (entry) => String(entry.id))

  return {
    species: buckets.species,
    speciesById,
    spots: sortedSpots,
    shopItems: buckets.shopItems,
    transports: buckets.transports,
    transportById: indexBy(buckets.transports, (entry) => String(entry.id)),
    countries: buckets.countries,
    countryById: indexBy(buckets.countries, (entry) => String(entry.id)),
    regions: buckets.regions,
    regionById: indexBy(buckets.regions, (entry) => String(entry.id)),
    expeditions: buckets.expeditions,
    expeditionById: indexBy(buckets.expeditions, (entry) => String(entry.id)),
    buyers: buckets.buyers,
    buyerById: indexBy(buckets.buyers, (entry) => String(entry.id)),
    contacts: buckets.contacts,
    contactById: indexBy(buckets.contacts, (entry) => String(entry.id)),
    speciesTradeProfiles: buckets.speciesTradeProfiles,
    speciesTradeProfileBySpeciesId: indexBy(buckets.speciesTradeProfiles, (entry) =>
      String(entry.speciesId),
    ),
    contactRewards: buckets.contactRewards,
    gear: buckets.gear,
    gearById: indexBy(buckets.gear, (entry) => String(entry.id)),
    methods: buckets.methods,
    methodById: indexBy(buckets.methods, (entry) => entry.id),
    brands: buckets.brands,
    brandById: indexBy(buckets.brands, (entry) => String(entry.id)),
    gearSeries: buckets.gearSeries,
    gearSeriesById: indexBy(buckets.gearSeries, (entry) => entry.id),
    primarySpot,
    encounters: buildEncounters(primarySpot, speciesById),
  }
}

/**
 * `BuiltInContent`（node loader が全 Content を読み終えた形）から束へ戻す。
 * テストや SSR など「全 Content が同期的に手元にある」環境で runtime を満たすために使う。
 */
export const bucketsFromBuiltInContent = (content: BuiltInContent): ContentBuckets => ({
  species: content.species,
  spots: content.spots,
  shopItems: content.shopItems,
  transports: content.transports,
  countries: content.countries,
  regions: content.regions,
  expeditions: content.expeditions,
  buyers: content.buyers,
  contacts: content.contacts,
  speciesTradeProfiles: content.speciesTradeProfiles,
  contactRewards: content.contactRewards,
  gear: content.gear,
  gearSeries: content.gearSeries,
  methods: content.methods,
  brands: content.brands,
})
