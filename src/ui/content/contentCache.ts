import { loadBuiltInContent, type BuiltInContent } from '../../content/catalog'

/**
 * 同梱コンテンツの共有キャッシュ。
 *
 * 検証（Zod）はアプリ起動時に 1 度だけ行えばよい。
 * 画面ごとに読み直すと、同じ検証を何度も走らせることになる。
 */

export type ContentResult =
  | { readonly ok: true; readonly value: BuiltInContent }
  | { readonly ok: false; readonly message: string }

let cached: BuiltInContent | null = null

export const tryGetBuiltInContent = (): ContentResult => {
  if (cached !== null) {
    return { ok: true, value: cached }
  }

  try {
    cached = loadBuiltInContent()
    return { ok: true, value: cached }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
