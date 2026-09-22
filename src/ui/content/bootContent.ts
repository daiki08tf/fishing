import { contentRuntime, type ContentRuntime } from '../../content/runtime/contentRuntime'

/**
 * AppShell が起動時に呼ぶ唯一の Content bootstrap（Phase 15.2）。
 *
 * ここで読むのは `bootPackKeys`（world + 今いる地域 + その地域の Species shard）だけ。
 * - tackle（装備カタログ）は **起動時に読まない**。Tackle / Shop / Spot / Fishing の
 *   gate（`usePack(GLOBAL_PACK_KEYS.tackle)`）が実際に必要になった時点で読む。
 * - HOME は tackle 未ロードでも NEUTRAL_FISHING_MODIFIERS 等の fallback で成立する。
 * - 他地域 / 全 Species detail も読まない。
 *
 * 「AppShell が何を読むか」を 1 か所に固定し、behavioral test で検証できるようにする。
 */
export const bootContentFor = (
  regionId: string,
  runtime: ContentRuntime = contentRuntime,
): Promise<void> => runtime.ensureBootPacks({ regionId })
