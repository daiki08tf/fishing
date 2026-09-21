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

/** `src/content/data` を読んで Content を組み立てる。Data が不正なら例外。 */
export const loadContentFromDirectory = (
  root = resolve(process.cwd(), 'src/content/data'),
): BuiltInContent =>
  assembleBuiltInContent({
    species: readKindDirectory(root, 'fish-species'),
    spots: readKindDirectory(root, 'fishing-spots'),
    shopItems: readKindDirectory(root, 'shop-items'),
  })
