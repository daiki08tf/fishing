import type { BuiltInContent } from '../../content/catalog'
import { contentRuntime } from '../../content/runtime/contentRuntime'

/**
 * 画面から見た Content（Phase 15）。
 *
 * 実体は contentRuntime が持つ「読み込み済み pack の合成結果」。
 * まだ読み込みが終わっていない間は ok: false を返すので、
 * 呼び出し側（AppShell / 各画面の gate）が loading 表示を出す。
 */

export type ContentResult =
  | { readonly ok: true; readonly value: BuiltInContent }
  | { readonly ok: false; readonly message: string }

export const tryGetBuiltInContent = (): ContentResult => {
  const content = contentRuntime.getState().content

  return content === null
    ? { ok: false, message: 'コンテンツを読み込み中' }
    : { ok: true, value: content }
}
