import { resolve } from 'node:path'
import type { BuiltInContent } from '../../src/content/catalog/assembleContent'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'

/**
 * テスト / simulation 専用の Content fixture。
 *
 * runtime Content（`src/content/data`）には **検証用の魚種を置かない**。
 * 釣りのループを検証するための合成魚種（サンプル魚 A〜J）はここに置き、
 * 必要なテスト / simulation だけが明示的に追加読み込みする。
 *
 * - runtime の Spot / Codex / 記録 UI に検証用魚は出ない
 * - simulation の結果を通常の Save へ書かない（simulation は Save を使わない）
 */
export const FIXTURE_CONTENT_ROOT = resolve(process.cwd(), 'tests/fixtures/content')

/** 検証用魚種の id。テスト / simulation から名前で参照するための定数。 */
export const SAMPLE_SPECIES = {
  small: 'phase1-sample-fish',
  lightSalt: 'phase2-sample-fish-b',
  salt: 'phase2-sample-fish-c',
  freshRiver: 'phase2-sample-fish-d',
  bigSalt: 'phase2-sample-fish-e',
  smallFresh: 'phase2-sample-fish-f',
  midSalt: 'phase2-sample-fish-g',
  brackish: 'phase2-sample-fish-h',
  bigOffshore: 'phase2-sample-fish-i',
  surf: 'phase2-sample-fish-j',
} as const

/** runtime Content + 検証用魚種。 */
export const loadFixtureContent = (): BuiltInContent =>
  loadContentFromDirectory(undefined, { fixtureRoots: [FIXTURE_CONTENT_ROOT] })
