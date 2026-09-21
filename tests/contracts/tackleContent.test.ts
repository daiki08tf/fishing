import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { validateContentReferences, knownOfferingTags } from '../../src/content/catalog/references'
import { DEFAULT_FISHING_TUNING } from '../../src/domain/fishing/FishingTuning'
import { rollEncounter, type EncounterCandidate } from '../../src/domain/encounter/encounterEngine'
import { asBrandId, asGearId } from '../../src/domain/ids'
import { SeededRandomSource } from '../../src/domain/rng/SeededRandomSource'
import { createStarterLoadout, resolveTackle, type Loadout } from '../../src/domain/tackle'
import type { GearItem, RodDefinition } from '../../src/domain/gear/Gear'

/**
 * 同梱 Content と Engine の契約（Phase 6）。
 *
 * 「Content を足すだけで装備が増える」ことを、実データで確認する。
 * ここは domain のユニットテストではなく、実 Content を使う結合テストである。
 */

const content = loadContentFromDirectory()

const setupOf = (loadout: Loadout) =>
  resolveTackle({ loadout, gear: content.gear, methods: content.methods })

describe('content catalog', () => {
  it('loads gear, methods and brands', () => {
    expect(content.gear.length).toBeGreaterThanOrEqual(20)
    expect(content.methods.length).toBeGreaterThanOrEqual(4)
    expect(content.brands.length).toBeGreaterThanOrEqual(10)
    expect(content.gearById['starter-rod']).toBeDefined()
    expect(content.methodById['lure']).toBeDefined()
    expect(content.brandById['shimara']).toBeDefined()
  })

  it('has no broken references', () => {
    expect(
      validateContentReferences({
        species: content.species,
        spots: content.spots,
        shopItems: content.shopItems,
        gear: content.gear,
        methods: content.methods,
        brands: content.brands,
        gearSeries: content.gearSeries,
        transports: content.transports,
      }),
    ).toEqual([])
  })

  it('has unique gear ids', () => {
    const ids = content.gear.map((item) => String(item.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves a brand name for every gear that declares one', () => {
    const branded = content.gear.filter((item) => item.brandId !== undefined)
    expect(branded.length).toBeGreaterThan(10)

    for (const item of branded) {
      expect(content.brandById[String(item.brandId)]?.name).toBeTruthy()
    }
  })

  it('keeps brands free of performance numbers', () => {
    // ブランドは性能を持たない（性能差は Gear のスペックで表現する）。
    for (const brand of content.brands) {
      for (const value of Object.values(brand)) {
        expect(typeof value).not.toBe('number')
      }
    }
  })

  it('ships every starter gear', () => {
    const starter = createStarterLoadout(asGearId)
    const ids = [
      starter.rodId,
      starter.reelId,
      starter.lineId,
      starter.hookId,
      starter.offeringId,
      starter.leaderId,
    ].filter((id): id is NonNullable<typeof id> => id !== null)

    for (const id of ids) {
      expect(content.gearById[String(id)]).toBeDefined()
    }
  })

  it('gives every species a provisional affinity table', () => {
    for (const species of content.species) {
      expect(Object.keys(species.methodAffinity ?? {}).length).toBeGreaterThan(0)
      expect(Object.keys(species.offeringAffinity ?? {}).length).toBeGreaterThan(0)
    }
  })
})

describe('starter tackle', () => {
  it('is a valid loadout', () => {
    const setup = setupOf(createStarterLoadout(asGearId))

    expect(setup).not.toBeNull()
    expect(setup?.compatibility.fatal).toBe(false)
    expect(setup?.compatibility.score).toBeGreaterThan(0.5)
  })

  it('lets the player fish without buying anything', () => {
    const setup = setupOf(createStarterLoadout(asGearId))

    expect(setup).not.toBeNull()
    expect(content.primarySpot.fishTable.length).toBeGreaterThan(0)
    expect(setup?.encounterProfile.offeringKind).toBe('lure')
  })
})

describe('adding content does not need engine changes', () => {
  it('accepts a brand new rod and method from content alone', () => {
    const newRod: RodDefinition = {
      id: asGearId('test-brand-new-rod'),
      category: 'rod',
      name: 'テスト新製品ロッド',
      price: 30000,
      brandId: asBrandId('shimara'),
      series: 'NEW SERIES',
      seriesCategory: 'bass',
      lengthM: 2.0,
      power: 'ML',
      action: 'fast',
      minLureWeightG: 3,
      maxLureWeightG: 20,
      recommendedLineMinKg: 2,
      recommendedLineMaxKg: 8,
      weightG: 110,
      sensitivity: 0.7,
      control: 0.65,
      fightingPower: 0.5,
      castingProfile: 0.6,
    }
    const gear: readonly GearItem[] = [...content.gear, newRod]
    const starter = createStarterLoadout(asGearId)
    const setup = resolveTackle({
      loadout: { ...starter, rodId: newRod.id, leaderId: null },
      gear,
      methods: content.methods,
    })

    expect(setup).not.toBeNull()
    expect(setup?.compatibility.fatal).toBe(false)
  })
})

describe('broken references are rejected', () => {
  const base = {
    species: content.species,
    spots: content.spots,
    shopItems: content.shopItems,
    gear: content.gear,
    methods: content.methods,
    brands: content.brands,
    gearSeries: content.gearSeries,
  }

  it('detects an unknown brand', () => {
    const issues = validateContentReferences({
      ...base,
      gear: [
        ...content.gear,
        { ...(content.gear[0] as GearItem), id: asGearId('x'), brandId: asBrandId('nope') },
      ],
    })

    expect(issues.some((issue) => issue.message.includes('unknown brandId'))).toBe(true)
  })

  it('detects an unknown method in a species affinity', () => {
    const species = content.species[0]

    if (species === undefined) {
      throw new Error('no species')
    }

    const issues = validateContentReferences({
      ...base,
      species: [{ ...species, methodAffinity: { 'no-such-method': 1.2 } }],
    })

    expect(issues.some((issue) => issue.message.includes('unknown method'))).toBe(true)
  })

  it('detects an unknown offering tag', () => {
    const species = content.species[0]

    if (species === undefined) {
      throw new Error('no species')
    }

    const issues = validateContentReferences({
      ...base,
      species: [{ ...species, offeringAffinity: { 'no-such-tag': 1.2 } }],
    })

    expect(issues.some((issue) => issue.message.includes('unknown offering tag'))).toBe(true)
  })

  it('detects a shop item that grants unknown gear', () => {
    const item = content.shopItems[0]

    if (item === undefined) {
      throw new Error('no shop item')
    }

    const issues = validateContentReferences({
      ...base,
      shopItems: [{ ...item, grantsGearId: asGearId('no-such-gear') }],
    })

    expect(issues.some((issue) => issue.message.includes('unknown gearId'))).toBe(true)
  })

  it('detects a starter loadout that points at missing gear', () => {
    const issues = validateContentReferences({
      ...base,
      gear: content.gear.filter((item) => String(item.id) !== 'starter-rod'),
    })

    expect(issues.some((issue) => issue.message.includes('starter loadout'))).toBe(true)
  })

  it('knows every offering tag used by the content', () => {
    const tags = knownOfferingTags(content.gear)

    for (const item of content.gear) {
      if (item.category === 'lure' || item.category === 'bait') {
        for (const tag of item.targetProfile) {
          expect(tags.has(tag)).toBe(true)
        }
      }
    }
  })
})

describe('offering changes the encounter distribution', () => {
  const spot = content.spots.find((entry) => String(entry.id) === 'tokyo-bay-shore')

  const candidates: readonly EncounterCandidate[] =
    spot === undefined
      ? []
      : spot.fishTable.flatMap((occurrence) => {
          const species = content.speciesById[String(occurrence.speciesId)]
          return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
        })

  const histogram = (profile: {
    readonly methodId: string
    readonly offeringTags: readonly string[]
    readonly biteAffinity: number
  }): Map<string, number> => {
    const counts = new Map<string, number>()

    for (let seed = 0; seed < 400; seed += 1) {
      const outcome = rollEncounter({
        candidates,
        random: new SeededRandomSource(seed),
        tuning: DEFAULT_FISHING_TUNING,
        profile,
      })

      if (outcome.kind !== 'bite') {
        continue
      }

      const id = String(outcome.candidate.species.id)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    return counts
  }

  it('uses the real spot table', () => {
    expect(candidates.length).toBeGreaterThanOrEqual(3)
  })

  it('selects different species with a lure and with a bait', () => {
    const lure = histogram({ methodId: 'lure', offeringTags: ['jig'], biteAffinity: 1.1 })
    const bait = histogram({ methodId: 'bottom', offeringTags: ['cut'], biteAffinity: 1.05 })
    const ids = new Set([...lure.keys(), ...bait.keys()])

    let differences = 0

    for (const id of ids) {
      if ((lure.get(id) ?? 0) !== (bait.get(id) ?? 0)) {
        differences += 1
      }
    }

    expect(differences).toBeGreaterThan(0)
  })

  it('is reproducible for the same seed set and profile', () => {
    const profile = { methodId: 'lure', offeringTags: ['jig'], biteAffinity: 1.1 }

    expect([...histogram(profile).entries()]).toEqual([...histogram(profile).entries()])
  })

  it('never hard-locks a species out of the spot', () => {
    // 「特定の offering でないと絶対に釣れない」を作らない。
    for (const species of candidates) {
      for (const profile of [
        { methodId: 'lure', offeringTags: ['jig'], biteAffinity: 1 },
        { methodId: 'bottom', offeringTags: ['cut'], biteAffinity: 1 },
        { methodId: 'light_lure', offeringTags: ['minnow'], biteAffinity: 1 },
      ]) {
        const affinityOk =
          (species.species.methodAffinity?.[profile.methodId] ?? 1) > 0 &&
          profile.offeringTags.every((tag) => (species.species.offeringAffinity?.[tag] ?? 1) > 0)

        expect(affinityOk).toBe(true)
      }
    }
  })
})
