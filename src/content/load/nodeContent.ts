import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  assembleBuiltInContent,
  ContentValidationError,
  type BuiltInContent,
  type ContentSource,
} from '../catalog/assembleContent'

/**
 * 同梱コンテンツの読み込み（Node）。
 *
 * ブラウザ側（src/content/catalog/builtInContent.ts）と同じ検証・組み立てを共有する。
 * シミュレータや検証スクリプトはこちらを使う。
 */

const readKindDirectory = (root: string, kind: string): readonly ContentSource[] => {
  const directory = join(root, kind)
  let names: readonly string[]

  try {
    names = readdirSync(directory)
  } catch {
    throw new ContentValidationError(kind, [`content directory not found: ${directory}`])
  }

  return names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const filePath = join(directory, name)

      try {
        return {
          source: filePath,
          value: JSON.parse(readFileSync(filePath, 'utf8')) as unknown,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new ContentValidationError(kind, [`invalid JSON in ${filePath}: ${message}`])
      }
    })
}

/**
 * テスト / simulation 用の Content 読み込みオプション。
 *
 * `fixtureRoots` で渡したディレクトリからは **fish-species だけ**を追加で読む。
 * 検証用の魚種を runtime の Spot から参照させないための分離である
 * （Spot / Gear / Region などは常に `root` 側だけを見る）。
 */
export type LoadContentOptions = {
  readonly fixtureRoots?: readonly string[]
}

/** `src/content/data` を読んで Content を組み立てる。Data が不正なら例外。 */
export const loadContentFromDirectory = (
  root = resolve(process.cwd(), 'src/content/data'),
  options: LoadContentOptions = {},
): BuiltInContent =>
  assembleBuiltInContent({
    species: [
      ...readKindDirectory(root, 'fish-species'),
      ...(options.fixtureRoots ?? []).flatMap((fixture) =>
        readKindDirectory(fixture, 'fish-species'),
      ),
    ],
    spots: readKindDirectory(root, 'fishing-spots'),
    shopItems: readKindDirectory(root, 'shop-items'),
    transports: readKindDirectory(root, 'transports'),
    countries: readKindDirectory(root, 'countries'),
    regions: readKindDirectory(root, 'regions'),
    expeditions: readKindDirectory(root, 'expeditions'),
    gear: readKindDirectory(root, 'gear'),
    methods: readKindDirectory(root, 'methods'),
    brands: readKindDirectory(root, 'brands'),
    gearSeries: readKindDirectory(root, 'gear-series'),
  })
