/**
 * 生成された Content Pack module の解決表（Phase 15）。
 *
 * pack 1 つ = dynamic import 1 つ。ここには **key と import 先だけ**が並ぶので、
 * 初期 chunk は Content 件数に比例して増えない。
 * 実際のファイル一覧は各 pack module（`src/content/generated/packs/*`）が持つ。
 */

export type GeneratedPackModule = {
  readonly load: () => Promise<Readonly<Record<string, readonly unknown[]>>>
}

export type PackModuleImporter = () => Promise<GeneratedPackModule>

const PACK_MODULES: Readonly<Record<string, PackModuleImporter>> = {
  'region:alaska': () => import('../generated/packs/region-alaska'),
  'region:british-columbia': () => import('../generated/packs/region-british-columbia'),
  'region:hokkaido': () => import('../generated/packs/region-hokkaido'),
  'region:queensland': () => import('../generated/packs/region-queensland'),
  'region:tokyo-area': () => import('../generated/packs/region-tokyo-area'),
  'species-detail': () => import('../generated/packs/species-detail'),
  tackle: () => import('../generated/packs/tackle'),
  world: () => import('../generated/packs/world'),
}

export const packModuleImporter = (key: string): PackModuleImporter | null =>
  PACK_MODULES[key] ?? null

/** 生成物と解決表の整合検査に使う（テスト / validation）。 */
export const knownPackModuleKeys = (): readonly string[] => Object.keys(PACK_MODULES).sort()
