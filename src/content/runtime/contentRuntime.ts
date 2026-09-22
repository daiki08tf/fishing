import type { BuiltInContent } from '../catalog/assembleContent'
import { packModuleImporter, type PackModuleImporter } from './packModules'
import {
  emptyContentBuckets,
  mergeContentBuckets,
  toBuiltInContent,
  type ContentBuckets,
} from '../catalog/mergeContent'
import {
  findGlobalPack,
  findPackForRegion,
  type ContentIndex,
  type ContentPackManifestEntry,
} from '../catalog/summary'
import contentIndex from '../generated/content-index.json'

/**
 * Content Pack の遅延ロード（Phase 15 / ブラウザ）。
 *
 * - 起動時に読むのは軽量カタログ（`content-index.json`）だけ。
 * - 実際の Content（Spot / Buyer / Reward / Species 詳細 / Tackle）は pack 単位で
 *   dynamic import し、session 中はキャッシュする（Save には何も書かない）。
 * - 同じ pack への同時要求は 1 つの Promise を共有する（重複ロードしない）。
 * - 失敗した pack だけ retry できる。状態は idle / loading / ready / error。
 *
 * Domain には Promise を持ち込まない。ここは Application / Infrastructure 境界である。
 */

export const GLOBAL_PACK_KEYS = {
  world: 'world',
  tackle: 'tackle',
} as const

export const regionPackKey = (regionId: string): string => `region:${regionId}`

/**
 * Phase 15.1: Species detail は Region ごとの shard に分かれている。
 * 1000 Species 規模でも「その地域・その Fish Box に必要な分」だけを読む。
 */
export const speciesShardKey = (regionId: string): string => `species:${regionId}`

/**
 * 起動 critical path の pack key（Phase 15.1）。
 * AppShell はこの 3 つだけを required にし、tackle / 他地域 / 全 Species は待たない。
 */
export const bootPackKeys = (regionId: string): readonly string[] => [
  GLOBAL_PACK_KEYS.world,
  regionPackKey(regionId),
  speciesShardKey(regionId),
]

export type PackStatus = 'idle' | 'loading' | 'ready' | 'error'

export type ContentRuntimeState = {
  readonly version: number
  readonly packStatus: Readonly<Record<string, PackStatus>>
  readonly packError: Readonly<Record<string, string | null>>
  readonly readyPackCount: number
  /** 読み込み済み Content（Spot が 1 つも無い間は null）。 */
  readonly content: BuiltInContent | null
}

export type ContentRuntime = {
  readonly index: ContentIndex
  getState(): ContentRuntimeState
  subscribe(listener: () => void): () => void
  packStatus(key: string): PackStatus
  packError(key: string): string | null
  /** pack を（未ロードなら）読み込む。同じ key の同時呼び出しは同じ Promise を返す。 */
  ensurePack(key: string): Promise<void>
  /** その地域を遊ぶのに必要な最小限（region pack + その地域の Species shard）。 */
  ensureRegion(regionId: string): Promise<void>
  /** 指定 Species の detail（+ trade profile）を必要時に読む（Fish Box / Trade 用）。 */
  ensureSpeciesDetail(speciesIds: readonly string[]): Promise<void>
  ensureTackle(): Promise<void>
  ensureWorld(): Promise<void>
  /** 失敗した pack をもう一度読む。 */
  retryPack(key: string): Promise<void>
  /**
   * 起動 critical path（Phase 15.1）: lightweight catalog は既に手元にあり、
   * world（軽量な地域定義）+ 今いる地域 + その地域の Species shard だけを読む。
   * tackle / 他地域 / 全 Species は起動では読まない。
   */
  ensureBootPacks(input: { readonly regionId: string }): Promise<void>
  /** その Species の detail を持つ shard（未知なら null）。 */
  speciesShardKeyOf(speciesId: string): string | null
  /** Region shard の総数と、そこに入っている Species 数（scale 検証 / レポート用）。 */
  speciesShardSummary(): readonly {
    readonly key: string
    readonly speciesIds: readonly string[]
  }[]
  /** テスト用: 読み込み済みの束（bundle へは出さない）。 */
  loadedBuckets(): ContentBuckets
  /**
   * 全 Content が同期的に手元にある環境（node / SSR / テスト）で runtime を満たす。
   * pack の読み込みを待たずに画面を描けるようにするための入口。
   */
  hydrateFully(buckets: ContentBuckets): void
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const bucketsForPack = (loaded: Readonly<Record<string, readonly unknown[]>>): ContentBuckets => {
  const base = emptyContentBuckets()
  const list = <T>(kind: string): readonly T[] => (loaded[kind] ?? []) as readonly T[]

  return {
    ...base,
    species: list('fish-species'),
    spots: list('fishing-spots'),
    shopItems: list('shop-items'),
    transports: list('transports'),
    countries: list('countries'),
    regions: list('regions'),
    expeditions: list('expeditions'),
    buyers: list('buyers'),
    speciesTradeProfiles: list('species-trade-profiles'),
    contactRewards: list('contact-rewards'),
    gear: list('gear'),
    gearSeries: list('gear-series'),
    methods: list('methods'),
    brands: list('brands'),
  }
}

export const createContentRuntime = (
  options: {
    readonly index?: ContentIndex
    /** テストで差し替えられる pack module 解決。既定は生成済み pack module。 */
    readonly loadPackModule?: (key: string) => PackModuleImporter | null
  } = {},
): ContentRuntime => {
  const index = options.index ?? (contentIndex as unknown as ContentIndex)
  const loadPackModule = options.loadPackModule ?? packModuleImporter
  const statuses: Record<string, PackStatus> = {}
  const errors: Record<string, string | null> = {}
  const pending = new Map<string, Promise<void>>()
  const listeners = new Set<() => void>()
  let buckets = emptyContentBuckets()
  let content: BuiltInContent | null = null
  let version = 0
  let snapshot: ContentRuntimeState = {
    version: 0,
    packStatus: {},
    packError: {},
    readyPackCount: 0,
    content: null,
  }

  const rebuildSnapshot = (): void => {
    version += 1

    try {
      content = buckets.spots.length === 0 ? null : toBuiltInContent(buckets)
    } catch {
      content = null
    }

    snapshot = {
      version,
      packStatus: { ...statuses },
      packError: { ...errors },
      readyPackCount: Object.values(statuses).filter((status) => status === 'ready').length,
      content,
    }
  }

  const emit = (): void => {
    rebuildSnapshot()

    for (const listener of listeners) {
      listener()
    }
  }

  const shardBySpeciesId = new Map(
    index.species.map((summary) => [String(summary.id), summary.detailShard]),
  )

  const packOf = (key: string): ContentPackManifestEntry | null =>
    findGlobalPack(index, key) ?? index.packs.find((pack) => pack.key === key) ?? null

  const loadPack = (pack: ContentPackManifestEntry): Promise<void> => {
    const existing = pending.get(pack.key)

    if (existing !== undefined) {
      return existing
    }

    statuses[pack.key] = 'loading'
    errors[pack.key] = null
    emit()

    const promise = (async (): Promise<void> => {
      try {
        const importer = loadPackModule(pack.key)

        if (importer === null) {
          throw new Error(`content pack module is not registered: ${pack.key}`)
        }

        const module = await importer()
        const loaded = await module.load()

        buckets = mergeContentBuckets(buckets, bucketsForPack(loaded))
        statuses[pack.key] = 'ready'
        errors[pack.key] = null
      } catch (error) {
        statuses[pack.key] = 'error'
        errors[pack.key] = messageOf(error)
        throw error
      } finally {
        pending.delete(pack.key)
        emit()
      }
    })()

    pending.set(pack.key, promise)
    return promise
  }

  const ensurePack = async (key: string): Promise<void> => {
    if (statuses[key] === 'ready') {
      return
    }

    const pack = packOf(key)

    if (pack === null) {
      throw new Error(`unknown content pack: ${key}`)
    }

    await loadPack(pack)
  }

  /** その地域を遊ぶのに必要な pack（region + その地域の Species shard）。 */
  const ensureRegionPacks = async (regionId: string): Promise<void> => {
    const pack = findPackForRegion(index, regionId)
    const speciesKey = `species:${regionId}`
    const speciesPack = index.packs.find((entry) => entry.key === speciesKey)
    const keys = [pack?.key, speciesPack?.key].filter((key): key is string => key !== undefined)

    await Promise.all(keys.map((key) => ensurePack(key)))
  }

  return {
    index,
    getState: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    packStatus: (key) => statuses[key] ?? 'idle',
    packError: (key) => errors[key] ?? null,
    ensurePack,
    ensureRegion: ensureRegionPacks,
    ensureSpeciesDetail: async (speciesIds) => {
      const keys = new Set<string>()

      for (const speciesId of speciesIds) {
        const shard = shardBySpeciesId.get(String(speciesId))

        if (shard !== null && shard !== undefined) {
          keys.add(shard)
        }
      }

      await Promise.all([...keys].map((key) => ensurePack(key)))
    },
    ensureTackle: () => ensurePack(GLOBAL_PACK_KEYS.tackle),
    ensureWorld: () => ensurePack(GLOBAL_PACK_KEYS.world),
    retryPack: async (key) => {
      statuses[key] = 'idle'
      errors[key] = null
      emit()
      await ensurePack(key)
    },
    ensureBootPacks: async ({ regionId }) => {
      await Promise.all([ensurePack(GLOBAL_PACK_KEYS.world), ensureRegionPacks(regionId)])
    },
    speciesShardKeyOf: (speciesId) => shardBySpeciesId.get(String(speciesId)) ?? null,
    speciesShardSummary: () =>
      Object.entries(index.speciesShards ?? {}).map(([key, speciesIds]) => ({
        key,
        speciesIds,
      })),
    loadedBuckets: () => buckets,
    hydrateFully: (next) => {
      buckets = next

      for (const pack of index.packs) {
        statuses[pack.key] = 'ready'
        errors[pack.key] = null
      }

      emit()
    },
  }
}

/** アプリ全体で共有する runtime（テストでは createContentRuntime を使う）。 */
export const contentRuntime: ContentRuntime = createContentRuntime()
