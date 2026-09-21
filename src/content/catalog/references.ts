import type { FishSpecies } from '../../domain/fish/FishSpecies'
import { BAIT_TYPES, LURE_TYPES, type GearItem } from '../../domain/gear/Gear'
import type { BrandDefinition } from '../../domain/gear/Brand'
import type { GearSeries } from '../../domain/gear/GearSeries'
import type { FishingMethod } from '../../domain/method/FishingMethod'
import type { ShopItem } from '../../domain/shop/ShopItem'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import {
  SLOT_CATEGORIES,
  STARTER_GEAR_IDS,
  STARTER_METHOD_ID,
  type LoadoutSlot,
} from '../../domain/tackle/Loadout'

/**
 * Content 間の**参照**の検証。
 *
 * 個々のレコードの形（Zod）は `schema` が担当する。
 * ここは「id の指す先が実在するか」だけを確かめる。
 * 参照切れの Content が Domain へ到達しないようにするための最後の関門である。
 *
 * 依存の向き: Content → Domain（Domain は Content を知らない）。
 */

export type ContentReferenceIssue = {
  /** 人間が直せるように、どのレコードのどこかを含める。 */
  readonly path: string
  readonly message: string
}

export type ContentReferenceInput = {
  readonly species: readonly FishSpecies[]
  readonly spots: readonly FishingSpot[]
  readonly shopItems: readonly ShopItem[]
  readonly gear: readonly GearItem[]
  readonly methods: readonly FishingMethod[]
  readonly brands: readonly BrandDefinition[]
  readonly gearSeries?: readonly GearSeries[]
}

/** offering の相性タグとして使える語彙（lureType / baitType / gear の targetProfile）。 */
export const knownOfferingTags = (gear: readonly GearItem[]): ReadonlySet<string> => {
  const tags = new Set<string>([...LURE_TYPES, ...BAIT_TYPES])

  for (const item of gear) {
    if (item.category === 'lure' || item.category === 'bait') {
      for (const tag of item.targetProfile) {
        tags.add(tag)
      }
    }
  }

  return tags
}

const STARTER_SLOTS: readonly { readonly slot: LoadoutSlot; readonly id: string }[] = [
  { slot: 'rod', id: STARTER_GEAR_IDS.rodId },
  { slot: 'reel', id: STARTER_GEAR_IDS.reelId },
  { slot: 'line', id: STARTER_GEAR_IDS.lineId },
  { slot: 'leader', id: STARTER_GEAR_IDS.leaderId },
  { slot: 'hook', id: STARTER_GEAR_IDS.hookId },
  { slot: 'offering', id: STARTER_GEAR_IDS.lureId },
  { slot: 'offering', id: STARTER_GEAR_IDS.baitId },
]

export const validateContentReferences = (
  input: ContentReferenceInput,
): readonly ContentReferenceIssue[] => {
  const issues: ContentReferenceIssue[] = []
  const gearSeries = input.gearSeries ?? []
  const speciesIds = new Set(input.species.map((entry) => String(entry.id)))
  const gearById = new Map(input.gear.map((entry) => [String(entry.id), entry]))
  const methodIds = new Set(input.methods.map((entry) => entry.id))
  const brandIds = new Set(input.brands.map((entry) => String(entry.id)))
  const seriesById = new Map(gearSeries.map((entry) => [entry.id, entry]))
  const offeringTags = knownOfferingTags(input.gear)
  /*
   * Tackle（Gear + Method）が同梱されていない部分的な Content 集合
   * （検証用 fixture など）では、Tackle を前提にした参照検査はできない。
   * Spot → 魚種のような Tackle に依存しない参照は常に検査する。
   */
  const hasTackleCatalog = input.gear.length > 0 && input.methods.length > 0

  // 0. id の重複（同じ id が 2 つあると、後から読んだ方が黙って勝つ）。
  const duplicate = (kind: string, values: readonly string[]): void => {
    const seen = new Set<string>()

    for (const value of values) {
      if (seen.has(value)) {
        issues.push({ path: kind, message: `duplicate id ${value}` })
      }
      seen.add(value)
    }
  }

  duplicate(
    'brands',
    input.brands.map((entry) => String(entry.id)),
  )
  duplicate(
    'gear-series',
    gearSeries.map((entry) => entry.id),
  )
  duplicate(
    'gear',
    input.gear.map((entry) => String(entry.id)),
  )
  duplicate(
    'methods',
    input.methods.map((entry) => entry.id),
  )
  duplicate(
    'fish-species',
    input.species.map((entry) => String(entry.id)),
  )
  duplicate(
    'fishing-spots',
    input.spots.map((entry) => String(entry.id)),
  )
  duplicate(
    'shop-items',
    input.shopItems.map((entry) => String(entry.id)),
  )

  // 1. Spot の fishTable は実在する魚種を指す。
  for (const spot of input.spots) {
    for (const occurrence of spot.fishTable) {
      if (!speciesIds.has(String(occurrence.speciesId))) {
        issues.push({
          path: `fishing-spots/${String(spot.id)}`,
          message: `unknown speciesId ${String(occurrence.speciesId)}`,
        })
      }
    }
  }

  // 2. Gear の brandId は実在するブランドを指す。
  for (const item of input.gear) {
    if (item.brandId !== undefined && !brandIds.has(String(item.brandId))) {
      issues.push({
        path: `gear/${String(item.id)}`,
        message: `unknown brandId ${String(item.brandId)}`,
      })
    }

    if (item.seriesId !== undefined) {
      const series = seriesById.get(item.seriesId)

      if (series === undefined) {
        issues.push({
          path: `gear/${String(item.id)}`,
          message: `unknown seriesId ${item.seriesId}`,
        })
      } else {
        if (item.brandId !== undefined && series.brandId !== item.brandId) {
          issues.push({
            path: `gear/${String(item.id)}`,
            message: `seriesId ${item.seriesId} belongs to brand ${String(series.brandId)}`,
          })
        }

        if (series.category !== item.category) {
          issues.push({
            path: `gear/${String(item.id)}`,
            message: `seriesId ${item.seriesId} is for ${series.category}, not ${item.category}`,
          })
        }

        if (item.series !== undefined && item.series !== series.name) {
          issues.push({
            path: `gear/${String(item.id)}`,
            message: `series name ${item.series} does not match series ${series.name}`,
          })
        }
      }
    }
  }

  // 2b. Series のブランドは実在すること。
  for (const series of gearSeries) {
    if (!brandIds.has(String(series.brandId))) {
      issues.push({
        path: `gear-series/${series.id}`,
        message: `unknown brandId ${String(series.brandId)}`,
      })
    }
  }

  // 3. Shop 商品の grantsGearId は実在する Gear を指す。
  for (const item of input.shopItems) {
    if (item.grantsGearId !== undefined && !gearById.has(String(item.grantsGearId))) {
      issues.push({
        path: `shop-items/${String(item.id)}`,
        message: `unknown gearId ${String(item.grantsGearId)}`,
      })
    }
  }

  // 4. Starter loadout は実在し、スロットに合うカテゴリであること。
  for (const entry of hasTackleCatalog ? STARTER_SLOTS : []) {
    const gear = gearById.get(entry.id)

    if (gear === undefined) {
      issues.push({
        path: 'gear',
        message: `starter loadout references unknown gear ${entry.id}`,
      })
      continue
    }

    if (!SLOT_CATEGORIES[entry.slot].includes(gear.category)) {
      issues.push({
        path: `gear/${entry.id}`,
        message: `starter ${entry.slot} slot cannot use ${gear.category}`,
      })
    }
  }

  if (hasTackleCatalog && !methodIds.has(STARTER_METHOD_ID)) {
    issues.push({
      path: 'methods',
      message: `starter loadout references unknown method ${STARTER_METHOD_ID}`,
    })
  }

  // 5. 釣法の offeringTags は offering の語彙であること。
  for (const method of input.methods) {
    for (const tag of method.offeringTags) {
      if (!offeringTags.has(tag)) {
        issues.push({
          path: `methods/${method.id}`,
          message: `unknown offering tag ${tag}`,
        })
      }
    }
  }

  // 6. 魚種の methodAffinity / offeringAffinity は語彙から外れないこと。
  for (const species of input.species) {
    for (const methodId of Object.keys(species.methodAffinity ?? {})) {
      if (!methodIds.has(methodId)) {
        issues.push({
          path: `fish-species/${String(species.id)}`,
          message: `methodAffinity references unknown method ${methodId}`,
        })
      }
    }

    for (const tag of Object.keys(species.offeringAffinity ?? {})) {
      if (!offeringTags.has(tag)) {
        issues.push({
          path: `fish-species/${String(species.id)}`,
          message: `offeringAffinity references unknown offering tag ${tag}`,
        })
      }
    }
  }

  return issues
}
