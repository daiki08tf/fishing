import { useMemo } from 'react'
import type { BuiltInContent } from '../../content/catalog'
import { tryGetBuiltInContent } from '../content/contentCache'
import { useContentRuntimeState } from '../content/contentRuntimeHooks'

export type ContentOrError =
  | { readonly ok: true; readonly value: BuiltInContent }
  | { readonly ok: false; readonly message: string }

/**
 * 読み込み済みの Content を返す（Phase 15）。
 * pack の読み込みで再評価されるよう、runtime の snapshot を購読する。
 */
export const useContentOrError = (): ContentOrError => {
  const state = useContentRuntimeState()

  return useMemo(() => tryGetBuiltInContent(), [state.version])
}
