import { useMemo } from 'react'
import type { BuiltInContent } from '../../content/catalog'
import { tryGetBuiltInContent } from '../content/contentCache'

export type ContentOrError =
  | { readonly ok: true; readonly value: BuiltInContent }
  | { readonly ok: false; readonly message: string }

/** コンテンツを 1 度だけ検証して返す。 */
export const useContentOrError = (): ContentOrError => useMemo(() => tryGetBuiltInContent(), [])
