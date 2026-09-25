import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * 開発ツール共通の repo ユーティリティ。
 * すべて相対パスで扱い、出力は決定論的（ソート済み）にする。
 */

export const REPO_ROOT = resolve(new URL('../../..', import.meta.url).pathname)

export const rel = (absolutePath: string): string => relative(REPO_ROOT, absolutePath)

export const abs = (relativePath: string): string => resolve(REPO_ROOT, relativePath)

export const pathExists = (relativePath: string): boolean => existsSync(abs(relativePath))

export const readJsonFile = (relativePath: string): unknown =>
  JSON.parse(readFileSync(abs(relativePath), 'utf8'))

export const listFilesRecursive = (
  relativeDir: string,
  predicate: (name: string) => boolean = () => true,
): readonly string[] => {
  const root = abs(relativeDir)
  if (!existsSync(root)) {
    return []
  }

  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(rel(full))
      }
    }
  }
  walk(root)
  return out.sort()
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git'])

/** リポジトリ内の全対象ファイル（ソート済み相対パス）。 */
export const listProjectFiles = (): readonly string[] => {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue
      }
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        out.push(rel(full))
      }
    }
  }
  walk(REPO_ROOT)
  return out.sort()
}

export const fileSizeBytes = (relativePath: string): number => statSync(abs(relativePath)).size

/** key 順序を無視した JSON 等価比較（migration は key 順を保存しない）。 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** git の出力を取得。失敗時は null。 */
export const git = (args: readonly string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export const gitHead = (): string => git(['rev-parse', '--short', 'HEAD']) ?? 'unknown'
export const gitBranch = (): string => git(['branch', '--show-current']) ?? 'unknown'
export const gitRemote = (): string => git(['remote', 'get-url', 'origin']) ?? 'none'

export const gitStatus = (): readonly string[] => {
  const out = git(['status', '--porcelain'])
  return out === null || out === '' ? [] : out.split('\n')
}

/** 変更ファイル一覧。`--staged` / `--base <ref>` / 既定は作業ツリー全体（untracked を含む）。 */
export const changedFiles = (options: {
  readonly staged?: boolean
  readonly base?: string
}): readonly string[] => {
  const args = options.staged
    ? ['diff', '--cached', '--name-only']
    : options.base !== undefined
      ? ['diff', '--name-only', options.base]
      : ['diff', '--name-only', 'HEAD']
  const out = git(args)
  const tracked =
    out === null || out === '' ? [] : out.split('\n').filter((line) => line.length > 0)

  // untracked も拾う（新規ファイルは diff に出ないが作業範囲である）。
  const untracked = gitStatus()
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .flatMap((path) => (path.endsWith('/') ? listFilesRecursive(path).map((file) => file) : [path]))

  return [...new Set([...tracked, ...untracked])].sort()
}

const IMPORT_RE = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g
const SIDE_EFFECT_IMPORT_RE = /import\s+['"]([^'"]+)['"]/g

/** TS/TSX ファイルの相対 import 先を抽出し、repo 相対パスに解決する。 */
export const importedPaths = (relativePath: string): readonly string[] => {
  const full = abs(relativePath)
  if (!existsSync(full) || !/\.tsx?$/.test(relativePath)) {
    return []
  }
  const source = readFileSync(full, 'utf8')
  const dir = join(REPO_ROOT, relativePath, '..')
  const found = new Set<string>()

  const addSpec = (spec: string): void => {
    if (!spec.startsWith('.')) {
      return
    }
    const base = resolve(dir, spec)
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.d.ts`,
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        found.add(rel(candidate))
        return
      }
    }
  }

  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1] !== undefined) {
      addSpec(match[1])
    }
  }
  for (const match of source.matchAll(SIDE_EFFECT_IMPORT_RE)) {
    if (match[1] !== undefined) {
      addSpec(match[1])
    }
  }
  return [...found].sort()
}
