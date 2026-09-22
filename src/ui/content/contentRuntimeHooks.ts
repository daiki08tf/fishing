import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  contentRuntime,
  regionPackKey,
  type ContentRuntimeState,
  type PackStatus,
} from '../../content/runtime/contentRuntime'

/**
 * Content Runtime を React から使うための薄いフック（Phase 15）。
 *
 * ロード状態は application/content 層（contentRuntime）が持ち、ここは
 * 購読と「必要な pack を要求する」副作用だけを担当する。
 */

export const useContentRuntimeState = (): ContentRuntimeState =>
  useSyncExternalStore(contentRuntime.subscribe, contentRuntime.getState, contentRuntime.getState)

export type RegionPackState = {
  readonly key: string
  readonly status: PackStatus
  readonly error: string | null
  readonly retry: () => void
}

/** その Region の Content Pack を（必要なら）読み込み、状態を返す。 */
export const useRegionPack = (regionId: string): RegionPackState => {
  const state = useContentRuntimeState()
  const key = regionPackKey(regionId)
  const knownRegion = contentRuntime.index.regions.some(
    (region) => String(region.id) === String(regionId),
  )

  useEffect(() => {
    if (!knownRegion) {
      return
    }

    void contentRuntime.ensureRegion(regionId).catch(() => undefined)
  }, [regionId, knownRegion])

  return {
    key,
    status: knownRegion ? (state.packStatus[key] ?? 'idle') : 'ready',
    error: state.packError[key] ?? null,
    retry: () => {
      void contentRuntime.retryPack(key).catch(() => undefined)
    },
  }
}

export type PackState = {
  readonly key: string
  readonly status: PackStatus
  readonly error: string | null
  readonly retry: () => void
}

/**
 * 単一 pack を必要時に読む（Tackle / Shop / Spot など）。
 * 読み込み中でも画面全体を止めない用途に使える。
 */
export const usePack = (key: string): PackState => {
  const state = useContentRuntimeState()

  useEffect(() => {
    void contentRuntime.ensurePack(key).catch(() => undefined)
  }, [key])

  return {
    key,
    status: state.packStatus[key] ?? 'idle',
    error: state.packError[key] ?? null,
    retry: () => {
      void contentRuntime.retryPack(key).catch(() => undefined)
    },
  }
}

/**
 * 指定 Species の detail（+ trade profile）を必要時に読む。
 *
 * Fish Box には別地域で釣った魚が残り得るので、保存された Species ID から
 * 必要な shard だけを追加で読む（Save には pack 情報を書かない）。
 */
export const useSpeciesDetail = (speciesIds: readonly string[]): PackState => {
  const state = useContentRuntimeState()
  const idsKey = [...speciesIds].map(String).sort().join(',')
  const shardKeys = useMemo(
    () =>
      [
        ...new Set(
          idsKey
            .split(',')
            .filter((id) => id.length > 0)
            .map((id) => contentRuntime.speciesShardKeyOf(id))
            .filter((key): key is string => key !== null),
        ),
      ].sort(),
    [idsKey],
  )

  useEffect(() => {
    if (shardKeys.length === 0) {
      return
    }

    void contentRuntime
      .ensureSpeciesDetail(shardKeys.length === 0 ? [] : idsKey.split(','))
      .catch(() => undefined)
  }, [idsKey, shardKeys.length])

  const failed = shardKeys.find((key) => state.packStatus[key] === 'error')
  const ready = shardKeys.every((key) => state.packStatus[key] === 'ready')

  return {
    key: shardKeys.join('+'),
    status: failed !== undefined ? 'error' : ready ? 'ready' : 'loading',
    error: failed === undefined ? null : (state.packError[failed] ?? null),
    retry: () => {
      for (const key of shardKeys) {
        void contentRuntime.retryPack(key).catch(() => undefined)
      }
    },
  }
}
