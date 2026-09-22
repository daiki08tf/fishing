import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import {
  bootPackKeys,
  createContentRuntime,
  GLOBAL_PACK_KEYS,
  regionPackKey,
  speciesShardKey,
} from '../../src/content/runtime/contentRuntime'
import type { ContentIndex } from '../../src/content/catalog/summary'

/**
 * Phase 15.1 — Runtime の「本当に必要な分だけ読む」挙動。
 *
 * 起動 critical path は lightweight catalog + world + 今いる地域 + その地域の
 * Species shard だけ。tackle / 他地域 / 全 Species detail は起動では読まない。
 */

const content = loadContentFromDirectory()

const tokyoSpots = content.spots.filter((spot) => String(spot.regionId) === 'tokyo-area')
const hokkaidoSpots = content.spots.filter((spot) => String(spot.regionId) === 'hokkaido')

const tokyoSpeciesIds = [
  ...new Set(
    tokyoSpots.flatMap((spot) => spot.fishTable.map((occurrence) => String(occurrence.speciesId))),
  ),
].sort()
const hokkaidoSpeciesIds = [
  ...new Set(
    hokkaidoSpots.flatMap((spot) =>
      spot.fishTable.map((occurrence) => String(occurrence.speciesId)),
    ),
  ),
].sort()

const speciesById = new Map(content.species.map((species) => [String(species.id), species]))
const profileBySpeciesId = new Map(
  content.speciesTradeProfiles.map((profile) => [String(profile.speciesId), profile]),
)

/** 実 Content を shard 構造どおりに返す fake loader。 */
const realContentLoader = (requested: string[]) => {
  const shardBySpeciesId = new Map(tokyoSpeciesIds.map((id) => [id, speciesShardKey('tokyo-area')]))
  for (const id of hokkaidoSpeciesIds) {
    if (!shardBySpeciesId.has(id)) {
      shardBySpeciesId.set(id, speciesShardKey('hokkaido'))
    }
  }

  return (
    key: string,
  ):
    | (() => Promise<{
        load: () => Promise<Readonly<Record<string, readonly unknown[]>>>
      }>)
    | null => {
    return async () => ({
      load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => {
        requested.push(key)

        if (key === regionPackKey('tokyo-area')) {
          return {
            'fishing-spots': tokyoSpots,
            buyers: content.buyers,
            'contact-rewards': content.contactRewards,
          }
        }

        if (key === regionPackKey('hokkaido')) {
          return { 'fishing-spots': hokkaidoSpots }
        }

        if (key === GLOBAL_PACK_KEYS.world) {
          return {
            regions: content.regions,
            countries: content.countries,
            transports: content.transports,
            expeditions: content.expeditions,
          }
        }

        if (key === GLOBAL_PACK_KEYS.tackle) {
          return { gear: content.gear, methods: content.methods }
        }

        if (key.startsWith('species:')) {
          const regionId = key.slice('species:'.length)
          const ids = regionId === 'tokyo-area' ? tokyoSpeciesIds : hokkaidoSpeciesIds

          return {
            'fish-species': ids.flatMap((id) => {
              const species = speciesById.get(id)
              return species === undefined ? [] : [species]
            }),
            'species-trade-profiles': ids.flatMap((id) => {
              const profile = profileBySpeciesId.get(id)
              return profile === undefined ? [] : [profile]
            }),
          }
        }

        return {}
      },
    })
  }
}

const createRuntime = () => {
  const requested: string[] = []
  const runtime = createContentRuntime({ loadPackModule: realContentLoader(requested) })

  return { runtime, requested }
}

describe('boot loading (Phase 15.1)', () => {
  it('boots with world + current region + that region species shard only', async () => {
    const { runtime, requested } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })

    expect(requested.sort()).toEqual(
      [GLOBAL_PACK_KEYS.world, regionPackKey('tokyo-area'), speciesShardKey('tokyo-area')].sort(),
    )
    expect(bootPackKeys('tokyo-area')).toEqual([
      GLOBAL_PACK_KEYS.world,
      regionPackKey('tokyo-area'),
      speciesShardKey('tokyo-area'),
    ])
  })

  it('does not load every species detail at boot', async () => {
    const { runtime } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })

    const buckets = runtime.loadedBuckets()

    // Tokyo に必要な Species だけが detail として入る（全 82 種ではない）。
    expect(buckets.species.length).toBe(tokyoSpeciesIds.length)
    expect(buckets.species.length).toBeLessThan(content.species.length)
    expect(buckets.speciesTradeProfiles.length).toBe(tokyoSpeciesIds.length)
  })

  it('does not load every region at boot', async () => {
    const { runtime } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })

    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('idle')
    expect(runtime.packStatus(speciesShardKey('hokkaido'))).toBe('idle')
    expect(runtime.loadedBuckets().spots.some((spot) => String(spot.regionId) === 'hokkaido')).toBe(
      false,
    )
  })

  it('does not require the tackle catalog to finish booting', async () => {
    const { runtime } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })

    expect(runtime.packStatus(GLOBAL_PACK_KEYS.tackle)).toBe('idle')
    expect(runtime.getState().content).not.toBeNull()
  })

  it('loads only the additional packs when moving to another region', async () => {
    const { runtime, requested } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })
    requested.length = 0

    await runtime.ensureRegion('hokkaido')

    expect(requested.sort()).toEqual(
      [regionPackKey('hokkaido'), speciesShardKey('hokkaido')].sort(),
    )
    // Tokyo の shard は再度読まない（共有 Species は shard 側で解決される）。
    expect(requested).not.toContain(speciesShardKey('tokyo-area'))
    expect(runtime.packStatus(speciesShardKey('hokkaido'))).toBe('ready')
  })

  it('keeps concurrent load dedup and retry', async () => {
    let failNext = true
    const requested: string[] = []
    const base = realContentLoader(requested)
    const runtime = createContentRuntime({
      loadPackModule: (key) => {
        if (key !== regionPackKey('hokkaido')) {
          return base(key)
        }

        return async () => ({
          load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => {
            if (failNext) {
              failNext = false
              throw new Error('offline')
            }

            requested.push(key)
            return { 'fishing-spots': hokkaidoSpots }
          },
        })
      },
    })

    await expect(runtime.ensureRegion('hokkaido')).rejects.toThrow('offline')
    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('error')

    await Promise.all([
      runtime.retryPack(regionPackKey('hokkaido')),
      runtime.retryPack(regionPackKey('hokkaido')),
    ])

    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('ready')
    expect(requested.filter((key) => key === regionPackKey('hokkaido'))).toHaveLength(1)
  })
})

describe('cross-region species detail (Fish Box)', () => {
  it('loads the shard for a saved fish from another region on demand', async () => {
    const { runtime, requested } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })
    requested.length = 0

    // Hokkaido で釣った魚が Fish Box に残っている状況。
    const foreignSpeciesId = hokkaidoSpeciesIds.find((id) => !tokyoSpeciesIds.includes(id))

    if (foreignSpeciesId === undefined) {
      throw new Error('no hokkaido-only species in content')
    }

    await runtime.ensureSpeciesDetail([foreignSpeciesId])

    expect(requested).toContain(speciesShardKey('hokkaido'))
    expect(
      runtime
        .loadedBuckets()
        .speciesTradeProfiles.some((profile) => String(profile.speciesId) === foreignSpeciesId),
    ).toBe(true)
  })

  it('does nothing for unknown species ids', async () => {
    const { runtime, requested } = createRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })
    requested.length = 0

    await runtime.ensureSpeciesDetail(['no-such-species'])

    expect(requested).toEqual([])
  })
})

describe('generated pack modules (integration)', () => {
  it('loads the real region + species shard packs and keeps others idle', async () => {
    const runtime = createContentRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })

    const buckets = runtime.loadedBuckets()

    expect(buckets.spots.map((spot) => String(spot.id)).sort()).toEqual(
      tokyoSpots.map((spot) => String(spot.id)).sort(),
    )
    expect(buckets.species.length).toBe(tokyoSpeciesIds.length)
    expect(buckets.speciesTradeProfiles.length).toBe(tokyoSpeciesIds.length)
    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('idle')
    expect(runtime.packStatus(GLOBAL_PACK_KEYS.tackle)).toBe('idle')

    await runtime.ensureTackle()
    expect(runtime.packStatus(GLOBAL_PACK_KEYS.tackle)).toBe('ready')
    expect(runtime.loadedBuckets().gear).toHaveLength(content.gear.length)

    await runtime.ensureRegion('hokkaido')
    expect(runtime.loadedBuckets().spots.some((spot) => String(spot.regionId) === 'hokkaido')).toBe(
      true,
    )
  }, 30000)
})

describe('runtime surface', () => {
  it('exposes species shard summary for scale reporting', () => {
    const runtime = createContentRuntime()
    const summary = runtime.speciesShardSummary()
    const tokyoShard = summary.find((entry) => entry.key === speciesShardKey('tokyo-area'))

    expect(tokyoShard?.speciesIds.length).toBe(tokyoSpeciesIds.length)
    expect(summary.length).toBeGreaterThanOrEqual(5)
  })

  it('does not put pack state into the fixture index', () => {
    const emptyIndex: ContentIndex = {
      generatedFrom: 'test',
      counts: {},
      species: [],
      regions: [],
      packs: [],
    }
    const runtime = createContentRuntime({ index: emptyIndex })

    expect(runtime.getState().packStatus).toEqual({})
    expect(runtime.getState().content).toBeNull()
  })
})
