import { useEffect, useSyncExternalStore } from 'react'
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
