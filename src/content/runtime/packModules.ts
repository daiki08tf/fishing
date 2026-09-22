import { PACK_MODULE_IMPORTS } from '../generated/pack-registry'

/**
 * 生成された Content Pack module の解決表（Phase 15 / 15.1）。
 *
 * 対応表そのものも生成物（`src/content/generated/pack-registry.ts`）で、
 * ここには lookup だけを置く。pack key → dynamic import の 1 段なので、
 * 初期 chunk は Content 件数に比例して増えない。
 */

export type GeneratedPackModule = {
  readonly load: () => Promise<Readonly<Record<string, readonly unknown[]>>>
}

export type PackModuleImporter = () => Promise<GeneratedPackModule>

export const packModuleImporter = (key: string): PackModuleImporter | null =>
  PACK_MODULE_IMPORTS[key] ?? null

/** 生成物と解決表の整合検査に使う（テスト / validation）。 */
export const knownPackModuleKeys = (): readonly string[] => Object.keys(PACK_MODULE_IMPORTS).sort()
