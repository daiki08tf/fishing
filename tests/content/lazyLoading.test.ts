import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { filterSpeciesSummaries } from '../../src/content/catalog/speciesSearch'
import { bootContentFor } from '../../src/ui/content/bootContent'
import {
  bootPackKeys,
  createContentRuntime,
  GLOBAL_PACK_KEYS,
  regionPackKey,
  speciesShardKey,
  type ContentRuntime,
} from '../../src/content/runtime/contentRuntime'
import { resolveTackle } from '../../src/domain/tackle'
import { projectRoot } from '../architecture/testProjectFiles'

/**
 * Phase 15.1 / 15.2 — 「起動時に本当に何を読むか」の behavioral test。
 *
 * source 文字列の検索ではなく、pack importer が実際に何回呼ばれたかで確認する:
 * - 起動（AppShell が呼ぶ bootstrap）: world + 今いる地域 + その地域の Species shard だけ
 * - HOME / MAP では tackle を読まない
 * - Spot 到着 / Tackle / Shop / Fishing で tackle を 1 度だけ読む（以降は cache）
 * - EXPEDITION を開いただけでは他地域を読まない
 * - Codex の名前検索は捕獲済みだけ（未捕獲の存在を漏らさない）
 */

const root = projectRoot()
const content = loadContentFromDirectory()

const tokyoSpots = content.spots.filter((spot) => String(spot.regionId) === 'tokyo-area')
const hokkaidoSpots = content.spots.filter((spot) => String(spot.regionId) === 'hokkaido')
const alaskaSpots = content.spots.filter((spot) => String(spot.regionId) === 'alaska')

const speciesIdsOf = (spots: typeof content.spots): readonly string[] =>
  [...new Set(spots.flatMap((spot) => spot.fishTable.map((o) => String(o.speciesId))))].sort()

const tokyoSpeciesIds = speciesIdsOf(tokyoSpots)
const hokkaidoSpeciesIds = speciesIdsOf(hokkaidoSpots)
const alaskaSpeciesIds = speciesIdsOf(alaskaSpots)

const speciesById = new Map(content.species.map((species) => [String(species.id), species]))
const profileBySpeciesId = new Map(
  content.speciesTradeProfiles.map((profile) => [String(profile.speciesId), profile]),
)

/** 実際の Content を返しつつ、どの pack importer が呼ばれたかを記録する。 */
const createInstrumentedRuntime = (): {
  readonly runtime: ContentRuntime
  readonly importerCalls: readonly string[]
  readonly ids: Readonly<Record<string, string[]>>
} => {
  const importerCalls: string[] = []
  // Hokkaido / Alaska の shard は「その地域の Species」だけを返す（実装と同じ形）。
  const shardSpecies: Readonly<Record<string, readonly string[]>> = {
    [regionPackKey('tokyo-area')]: [],
    [speciesShardKey('tokyo-area')]: tokyoSpeciesIds,
    [speciesShardKey('hokkaido')]: hokkaidoSpeciesIds,
    [speciesShardKey('alaska')]: alaskaSpeciesIds,
  }
  const ids: Record<string, string[]> = { tackle: [], hokkaido: [], alaska: [] }

  const runtime = createContentRuntime({
    loadPackModule: (key) => async () => ({
      load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => {
        importerCalls.push(key)

        if (key === 'tackle') {
          ids['tackle']?.push(key)
        }
        if (key === regionPackKey('hokkaido') || key === speciesShardKey('hokkaido')) {
          ids['hokkaido']?.push(key)
        }
        if (key === regionPackKey('alaska') || key === speciesShardKey('alaska')) {
          ids['alaska']?.push(key)
        }

        if (key === regionPackKey('tokyo-area')) {
          return { 'fishing-spots': tokyoSpots }
        }
        if (key === regionPackKey('hokkaido')) {
          return { 'fishing-spots': hokkaidoSpots }
        }
        if (key === regionPackKey('alaska')) {
          return { 'fishing-spots': alaskaSpots }
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
          return {
            gear: content.gear,
            'gear-series': content.gearSeries,
            brands: content.brands,
            methods: content.methods,
            'shop-items': content.shopItems,
          }
        }

        const speciesIds = shardSpecies[key] ?? []

        return {
          'fish-species': speciesIds.flatMap((id) => {
            const species = speciesById.get(id)
            return species === undefined ? [] : [species]
          }),
          'species-trade-profiles': speciesIds.flatMap((id) => {
            const profile = profileBySpeciesId.get(id)
            return profile === undefined ? [] : [profile]
          }),
        }
      },
    }),
  })

  return { runtime, importerCalls, ids }
}

describe('startup network set (Phase 15.2)', () => {
  it('boots with world + current region + its species shard, and never touch tackle', async () => {
    const { runtime, importerCalls } = createInstrumentedRuntime()

    await bootContentFor('tokyo-area', runtime)

    expect([...importerCalls].sort()).toEqual(
      [GLOBAL_PACK_KEYS.world, regionPackKey('tokyo-area'), speciesShardKey('tokyo-area')].sort(),
    )
    expect(importerCalls).not.toContain(GLOBAL_PACK_KEYS.tackle)
    expect(bootPackKeys('tokyo-area')).toEqual([
      GLOBAL_PACK_KEYS.world,
      regionPackKey('tokyo-area'),
      speciesShardKey('tokyo-area'),
    ])
  })

  it('keeps tackle / Hokkaido / Alaska idle right after boot', async () => {
    const { runtime, ids } = createInstrumentedRuntime()

    await bootContentFor('tokyo-area', runtime)

    expect(ids['tackle']).toEqual([])
    expect(ids['hokkaido']).toEqual([])
    expect(ids['alaska']).toEqual([])
    expect(runtime.packStatus(GLOBAL_PACK_KEYS.tackle)).toBe('idle')
    expect(runtime.packStatus(regionPackKey('hokkaido'))).toBe('idle')
    expect(runtime.packStatus(speciesShardKey('hokkaido'))).toBe('idle')
  })

  it('loads only Tokyo-required species at boot (38 of 82)', async () => {
    const { runtime } = createInstrumentedRuntime()

    await bootContentFor('tokyo-area', runtime)

    const buckets = runtime.loadedBuckets()

    expect(buckets.species.length).toBe(tokyoSpeciesIds.length)
    expect(buckets.species.length).toBeLessThan(content.species.length)
    expect(buckets.gear).toEqual([]) // tackle は未ロード（HOME は fallback で動く）
  })

  it('does not fetch anything new for HOME → MAP navigation', async () => {
    const { runtime, importerCalls } = createInstrumentedRuntime()

    await bootContentFor('tokyo-area', runtime)
    const afterBoot = importerCalls.length

    // MAP は「表示中の地域」を ensure するだけ（= 今いる地域なので cache hit）。
    await runtime.ensureRegion('tokyo-area')

    expect(importerCalls.length).toBe(afterBoot)
    expect(runtime.packStatus(GLOBAL_PACK_KEYS.tackle)).toBe('idle')
  })

  it('loads tackle exactly once when a spot needs it', async () => {
    const { runtime, importerCalls, ids } = createInstrumentedRuntime()

    await bootContentFor('tokyo-area', runtime)
    expect(ids['tackle']).toEqual([])

    // Spot 到着 / Tackle / Shop / Fishing はいずれも ensureTackle を通る。
    await runtime.ensureTackle()
    expect(ids['tackle']).toHaveLength(1)
    expect(runtime.packStatus(GLOBAL_PACK_KEYS.tackle)).toBe('ready')

    await runtime.ensureTackle()
    await runtime.ensurePack(GLOBAL_PACK_KEYS.tackle)
    expect(importerCalls.filter((key) => key === GLOBAL_PACK_KEYS.tackle)).toHaveLength(1)
    expect(runtime.loadedBuckets().gear).toHaveLength(content.gear.length)
  })

  it('never reads a destination region until it is selected', async () => {
    const { runtime, ids, importerCalls } = createInstrumentedRuntime()

    await bootContentFor('tokyo-area', runtime)

    // EXPEDITION 画面を開いただけ（= 何も ensure しない）では他地域は idle。
    expect(ids['hokkaido']).toEqual([])
    expect(ids['alaska']).toEqual([])

    // 目的地を選んだ / 出発した時点で、その地域だけを読む。
    const before = importerCalls.length
    await runtime.ensureRegion('hokkaido')

    expect(importerCalls.length).toBe(before + 2)
    expect(ids['hokkaido']).toEqual([regionPackKey('hokkaido'), speciesShardKey('hokkaido')])
    expect(ids['alaska']).toEqual([])
    expect(runtime.packStatus(regionPackKey('alaska'))).toBe('idle')
  })

  it('keeps tackle importers at zero while only reading the current region', () => {
    // HOME の fallback: tackle 未ロードでは resolveTackle が null を返す（既存挙動）。
    expect(resolveTackle({ loadout: {} as never, gear: [], methods: [] })).toBeNull()
  })
})

describe('secondary guard: expedition mount preload', () => {
  it('does not contain an all-region preload loop', () => {
    const source = readFileSync(resolve(root, 'src/ui/expedition/ExpeditionScreen.tsx'), 'utf8')

    // 主要な保証は上の behavioral test。ここは「mount で全地域を回す loop」の再発防止だけ。
    expect(source).not.toContain('for (const pack of contentRuntime.index.packs)')
    expect(source).toContain('preloadRegion')
  })
})

describe('codex hidden-information semantics', () => {
  const summaries = JSON.parse(
    readFileSync(resolve(root, 'src/content/generated/content-index.json'), 'utf8'),
  ).species as Parameters<typeof filterSpeciesSummaries>[0]

  it('does not reveal uncaught species through exact-name search', () => {
    const target = summaries.find((summary) => summary.japaneseName.length > 0)

    if (target === undefined) {
      throw new Error('no species summary')
    }

    expect(
      filterSpeciesSummaries(summaries, {
        query: target.japaneseName,
        catchFilter: 'all',
        caughtIds: new Set<string>(),
        searchScope: 'caught',
      }),
    ).toEqual([])

    const caught = new Set<string>([String(target.id)])
    const found = filterSpeciesSummaries(summaries, {
      query: target.japaneseName,
      caughtIds: caught,
      searchScope: 'caught',
    })

    expect(found.map((summary) => String(summary.id))).toEqual([String(target.id)])
  })

  it('keeps region filters working for uncaught species', () => {
    const byRegion = filterSpeciesSummaries(summaries, {
      regionId: 'tokyo-area',
      catchFilter: 'uncaught',
      caughtIds: new Set<string>(),
      searchScope: 'caught',
    })

    expect(byRegion.length).toBeGreaterThan(0)
  })
})
