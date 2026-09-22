import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { regionPackKey, GLOBAL_PACK_KEYS } from '../../src/content/runtime/contentRuntime'
import { createContentRuntime } from '../../src/content/runtime/contentRuntime'
import type { ContentIndex } from '../../src/content/catalog/summary'

/**
 * Phase 15 — Content Pack の遅延ロード（cache / 同時要求 / retry）。
 *
 * 実 pack module の代わりに fake を注入して、アプリ側のロジックだけを検証する。
 */

const content = loadContentFromDirectory()

const index: ContentIndex = {
  generatedFrom: 'test',
  counts: {},
  species: [],
  regions: [],
  packs: [
    { key: 'world', kind: 'global', label: 'World', kinds: ['regions'] },
    {
      key: 'region:tokyo-area',
      kind: 'region',
      label: 'Tokyo',
      regionId: 'tokyo-area' as never,
      kinds: ['fishing-spots'],
    },
  ],
}

const tokyoSpots = content.spots.filter((spot) => String(spot.regionId) === 'tokyo-area')

describe('content runtime', () => {
  const createFakeRuntime = (options: { readonly failFirst?: boolean } = {}) => {
    const calls = { world: 0, tokyo: 0, tokyoLoads: 0 }
    let failNext = options.failFirst ?? false

    const runtime = createContentRuntime({
      index,
      loadPackModule: (key) => {
        if (key === 'world') {
          return async () => ({
            load: async () => {
              calls.world += 1
              return { regions: content.regions }
            },
          })
        }

        if (key === regionPackKey('tokyo-area')) {
          return async () => ({
            load: async () => {
              calls.tokyoLoads += 1

              if (failNext) {
                failNext = false
                throw new Error('network down')
              }

              return { 'fishing-spots': tokyoSpots }
            },
          })
        }

        calls.tokyo += 1
        return null
      },
    })

    return { runtime, calls }
  }

  it('loads a pack once and caches it for the session', async () => {
    const { runtime, calls } = createFakeRuntime()

    expect(runtime.packStatus('world')).toBe('idle')

    await runtime.ensurePack('world')
    await runtime.ensurePack('world')

    expect(calls.world).toBe(1)
    expect(runtime.packStatus('world')).toBe('ready')
    expect(runtime.loadedBuckets().regions).toHaveLength(content.regions.length)
  })

  it('shares one promise for concurrent loads of the same pack', async () => {
    const { runtime, calls } = createFakeRuntime()

    await Promise.all([
      runtime.ensureRegion('tokyo-area'),
      runtime.ensureRegion('tokyo-area'),
      runtime.ensureRegion('tokyo-area'),
    ])

    expect(calls.tokyoLoads).toBe(1)
    expect(runtime.packStatus(regionPackKey('tokyo-area'))).toBe('ready')
  })

  it('reports loading / ready and assembles content from packs', async () => {
    const { runtime } = createFakeRuntime()

    expect(runtime.getState().content).toBeNull()

    await runtime.ensureRegion('tokyo-area')
    // Region pack（Spot を含む）が入った時点で content が組み立てられる。
    expect(runtime.getState().content?.spots).toHaveLength(tokyoSpots.length)
    expect(runtime.packStatus(regionPackKey('tokyo-area'))).toBe('ready')

    await runtime.ensurePack('world')
    expect(runtime.getState().content?.regions).toHaveLength(content.regions.length)
  })

  it('keeps the failure scoped to one pack and retries it', async () => {
    const { runtime } = createFakeRuntime({ failFirst: true })

    await expect(runtime.ensureRegion('tokyo-area')).rejects.toThrow('network down')
    expect(runtime.packStatus(regionPackKey('tokyo-area'))).toBe('error')
    expect(runtime.packError(regionPackKey('tokyo-area'))).toContain('network down')

    // 他の pack は影響を受けない。
    await runtime.ensurePack('world')
    expect(runtime.packStatus('world')).toBe('ready')

    await runtime.retryPack(regionPackKey('tokyo-area'))
    expect(runtime.packStatus(regionPackKey('tokyo-area'))).toBe('ready')
    expect(runtime.loadedBuckets().spots).toHaveLength(tokyoSpots.length)
  })

  it('throws for an unknown pack key', async () => {
    const { runtime } = createFakeRuntime()

    await expect(runtime.ensurePack('region:atlantis')).rejects.toThrow('unknown content pack')
  })

  it('loads initial packs (world + region + species + tackle)', async () => {
    const loaded: string[] = []
    const runtime = createContentRuntime({
      index: {
        ...index,
        packs: [
          ...index.packs,
          { key: GLOBAL_PACK_KEYS.speciesDetail, kind: 'global', label: 'Species' },
          { key: GLOBAL_PACK_KEYS.tackle, kind: 'global', label: 'Tackle' },
        ],
      },
      loadPackModule: (key) => async () => ({
        load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => {
          loaded.push(key)

          if (key === regionPackKey('tokyo-area')) {
            return { 'fishing-spots': tokyoSpots }
          }

          if (key === 'world') {
            return { regions: content.regions }
          }

          return {}
        },
      }),
    })

    await runtime.ensureInitialPacks({ regionId: 'tokyo-area' })

    expect(loaded.sort()).toEqual(
      [
        GLOBAL_PACK_KEYS.speciesDetail,
        GLOBAL_PACK_KEYS.tackle,
        GLOBAL_PACK_KEYS.world,
        regionPackKey('tokyo-area'),
      ].sort(),
    )
    expect(runtime.getState().content?.spots).toHaveLength(tokyoSpots.length)
  })

  it('never puts loaded content into the Save (domain stays pack-agnostic)', () => {
    const { runtime } = createFakeRuntime()

    expect(Object.keys(runtime.getState())).toEqual([
      'version',
      'packStatus',
      'packError',
      'readyPackCount',
      'content',
    ])
  })

  it('exposes buyer region enforcement data from the loaded pack', async () => {
    const runtime = createContentRuntime({
      index,
      loadPackModule: (key) =>
        key === regionPackKey('tokyo-area')
          ? async () => ({
              load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => ({
                buyers: content.buyers,
              }),
            })
          : async () => ({
              load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => ({
                regions: content.regions,
              }),
            }),
    })

    await runtime.ensureRegion('tokyo-area')
    await runtime.ensurePack('world')

    const buyers = runtime.loadedBuckets().buyers

    expect(buyers.length).toBeGreaterThan(0)
    expect(buyers.every((buyer) => String(buyer.regionId) === 'tokyo-area')).toBe(true)
  })
})

describe('generated pack modules (integration)', () => {
  it('loads the real tokyo-area / species-detail / tackle packs', async () => {
    const runtime = createContentRuntime()
    const tokyoPack = runtime.index.packs.find((pack) => pack.key === regionPackKey('tokyo-area'))
    const speciesPack = runtime.index.packs.find(
      (pack) => pack.key === GLOBAL_PACK_KEYS.speciesDetail,
    )

    expect(tokyoPack, 'tokyo pack must be in the manifest').toBeDefined()
    expect(speciesPack, 'species pack must be in the manifest').toBeDefined()

    await runtime.ensureRegion('tokyo-area')
    await runtime.ensureSpeciesDetail()
    await runtime.ensureTackle()

    const buckets = runtime.loadedBuckets()
    const tokyoSpots = content.spots.filter((spot) => String(spot.regionId) === 'tokyo-area')

    expect(buckets.spots.map((spot) => String(spot.id)).sort()).toEqual(
      tokyoSpots.map((spot) => String(spot.id)).sort(),
    )
    expect(buckets.species).toHaveLength(content.species.length)
    expect(buckets.speciesTradeProfiles).toHaveLength(content.speciesTradeProfiles.length)
    expect(buckets.gear).toHaveLength(content.gear.length)
    expect(buckets.methods.length).toBeGreaterThan(0)

    // 別 Region は読み込まれていない（別 pack として分離されている）。
    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('idle')
    expect(buckets.spots.some((spot) => String(spot.regionId) === 'hokkaido')).toBe(false)

    // 必要になったら読める。
    await runtime.ensureRegion('hokkaido')
    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('ready')
    expect(runtime.loadedBuckets().spots.some((spot) => String(spot.regionId) === 'hokkaido')).toBe(
      true,
    )
  }, 30000)
})
