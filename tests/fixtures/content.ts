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

/**
 * 検証用魚種（サンプル魚 A〜J）のうち、テスト / simulation が名前で参照するもの。
 * 他の検証用魚は、参照したいテストができたときにここへ足す。
 */
export const SAMPLE_SPECIES = {
  /** サンプル魚 A。小型の基準。 */
  small: 'phase1-sample-fish',
  /** サンプル魚 E。中型の基準（Text Battle の中型シナリオ）。 */
  bigSalt: 'phase2-sample-fish-e',
  /** サンプル魚 F。小型淡水の基準（Text Battle の小型シナリオ）。 */
  smallFresh: 'phase2-sample-fish-f',
  /** サンプル魚 I。大型の基準（Tackle / Big Game の比較）。 */
  bigOffshore: 'phase2-sample-fish-i',
} as const

/** runtime Content + 検証用魚種。 */
export const loadFixtureContent = (): BuiltInContent =>
  loadContentFromDirectory(undefined, { fixtureRoots: [FIXTURE_CONTENT_ROOT] })
