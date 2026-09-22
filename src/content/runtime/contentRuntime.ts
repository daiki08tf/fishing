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
  speciesDetail: 'species-detail',
  tackle: 'tackle',
} as const

export const regionPackKey = (regionId: string): string => `region:${regionId}`

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
  ensureRegion(regionId: string): Promise<void>
  ensureSpeciesDetail(): Promise<void>
  ensureTackle(): Promise<void>
  ensureWorld(): Promise<void>
  /** 失敗した pack をもう一度読む。 */
  retryPack(key: string): Promise<void>
  /** 起動時に必要な pack（world + 指定 Region + species 詳細 + tackle）。 */
  ensureInitialPacks(input: {
    readonly regionId: string
    readonly withTackle?: boolean
  }): Promise<void>
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
    ensureRegion: async (regionId) => {
      const pack = findPackForRegion(index, regionId)

      if (pack === null) {
        return
      }

      await ensurePack(pack.key)
    },
    ensureSpeciesDetail: () => ensurePack(GLOBAL_PACK_KEYS.speciesDetail),
    ensureTackle: () => ensurePack(GLOBAL_PACK_KEYS.tackle),
    ensureWorld: () => ensurePack(GLOBAL_PACK_KEYS.world),
    retryPack: async (key) => {
      statuses[key] = 'idle'
      errors[key] = null
      emit()
      await ensurePack(key)
    },
    ensureInitialPacks: async ({ regionId, withTackle = true }) => {
      await Promise.all([
        ensurePack(GLOBAL_PACK_KEYS.world),
        ensurePack(GLOBAL_PACK_KEYS.speciesDetail),
        ...(withTackle ? [ensurePack(GLOBAL_PACK_KEYS.tackle)] : []),
        ensurePack(regionPackKey(regionId)),
      ])
    },
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
