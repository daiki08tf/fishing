import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SourceFile } from './sourceScanner'

/** リポジトリ root（このファイルから 2 つ上）。 */
export const projectRoot = (): string => fileURLToPath(new URL('../../', import.meta.url))

const walk = (directory: string): readonly string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...walk(path))
      continue
    }

    if (entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))) {
      files.push(path)
    }
  }

  return files
}

/** リポジトリ内の TypeScript ソースを、リポジトリ相対パス付きで読み込む。 */
export const readProjectSources = (): readonly SourceFile[] => {
  const root = projectRoot()
  const directories = ['src', 'tests', 'scripts']

  return directories.flatMap((directory) =>
    walk(join(root, directory)).map((filePath) => ({
      path: relative(root, filePath),
      source: readFileSync(filePath, 'utf8'),
    })),
  )
}
