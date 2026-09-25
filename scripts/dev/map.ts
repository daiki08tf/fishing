import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  importedPaths,
  listFilesRecursive,
  listProjectFiles,
  pathExists,
  readJsonFile,
  REPO_ROOT,
} from './lib/repo'

/**
 * Project map 生成。
 *
 * 入力:
 *   .dev/systems.json        — system の定義（paths で bucket する）
 *   .dev/authority-map.json  — 人手で保守する authority 定義
 *   実ファイルツリー + import グラフ
 *
 * 出力:
 *   .dev/project-map.json — 生成物。決定論的なのでコミット対象。
 *                          doctor が鮮度を検査する。
 */

export type SystemDefinition = {
  readonly id: string
  readonly title: string
  readonly paths: readonly string[]
  readonly docs: readonly string[]
  readonly concepts: readonly string[]
}

export type AuthorityDefinition = {
  readonly id: string
  readonly title: string
  readonly authority: readonly string[]
  readonly derived?: readonly string[]
  readonly persisted: string
  readonly mutation: readonly string[]
  readonly validation: string
  readonly notes: string
}

export type SystemsFile = { readonly systems: readonly SystemDefinition[] }
export type AuthorityMapFile = { readonly authorities: readonly AuthorityDefinition[] }

export type MappedSystem = SystemDefinition & {
  readonly files: readonly string[]
  readonly tests: readonly string[]
  readonly consumers: readonly string[]
  readonly dependencies: readonly string[]
}

export type MappedAuthority = AuthorityDefinition & {
  readonly resolvedFiles: readonly string[]
  readonly missingPaths: readonly string[]
  readonly consumers: readonly string[]
  readonly tests: readonly string[]
}

export type ContentKindSummary = {
  readonly kind: string
  readonly dir: string
  readonly files: number
}

export type ProjectMap = {
  readonly version: 1
  readonly generatedFrom: readonly string[]
  readonly systems: readonly MappedSystem[]
  readonly authorities: readonly MappedAuthority[]
  readonly contentKinds: readonly ContentKindSummary[]
  readonly fileCounts: { readonly source: number; readonly tests: number; readonly content: number }
}

const SYSTEMS_PATH = '.dev/systems.json'
const AUTHORITY_MAP_PATH = '.dev/authority-map.json'
export const PROJECT_MAP_PATH = '.dev/project-map.json'

const CODE_RE = /\.tsx?$/

const isTestFile = (path: string): boolean =>
  path.endsWith('.test.ts') || path.endsWith('.test.tsx') || path.startsWith('tests/')

const matchesPrefix = (path: string, prefix: string): boolean =>
  prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix

const bucketFor = (path: string, systems: readonly SystemDefinition[]): string => {
  for (const system of systems) {
    if (system.paths.some((prefix) => matchesPrefix(path, prefix))) {
      return system.id
    }
  }
  return 'unmapped'
}

/** authority entry が挙げる path（ファイル or ディレクトリ）を実ファイルへ展開する。 */
const expandPaths = (paths: readonly string[]): { files: string[]; missing: string[] } => {
  const files = new Set<string>()
  const missing: string[] = []

  for (const path of paths) {
    const bare = path.replace(/ \(.*\)$/, '')
    if (bare.includes('*')) {
      // glob 風の指定（例: src/content/data/fish-species/*.json）は prefix 部分を
      // ディレクトリとして展開し、拡張子で絞る。
      const prefix = bare.slice(0, bare.indexOf('*'))
      const dir = prefix.endsWith('/') ? prefix : prefix.slice(0, prefix.lastIndexOf('/') + 1)
      const suffix = bare.slice(bare.lastIndexOf('*') + 1)
      const matched = listFilesRecursive(dir).filter((file) => file.endsWith(suffix))
      if (matched.length === 0) {
        missing.push(bare)
      }
      for (const file of matched) {
        files.add(file)
      }
      continue
    }
    if (!pathExists(bare)) {
      missing.push(bare)
      continue
    }
    if (bare.endsWith('/')) {
      for (const file of listFilesRecursive(bare)) {
        files.add(file)
      }
    } else {
      files.add(bare)
    }
  }

  return { files: [...files].sort(), missing }
}

export const buildProjectMap = (): ProjectMap => {
  const systems = (readJsonFile(SYSTEMS_PATH) as SystemsFile).systems
  const authorities = (readJsonFile(AUTHORITY_MAP_PATH) as AuthorityMapFile).authorities
  const allFiles = listProjectFiles()
  const codeFiles = allFiles.filter((file) => CODE_RE.test(file))

  // import グラフ（逆参照: imported -> importers）
  const importers = new Map<string, string[]>()
  const directImports = new Map<string, string[]>()
  for (const file of codeFiles) {
    const targets = importedPaths(file)
    directImports.set(file, [...targets])
    for (const target of targets) {
      const list = importers.get(target) ?? []
      list.push(file)
      importers.set(target, list)
    }
  }

  // system ごとの bucket
  const systemFiles = new Map<string, string[]>()
  for (const system of systems) {
    systemFiles.set(system.id, [])
  }
  systemFiles.set('unmapped', [])
  for (const file of allFiles) {
    systemFiles.get(bucketFor(file, systems))?.push(file)
  }

  const systemOf = new Map<string, string>()
  for (const file of allFiles) {
    systemOf.set(file, bucketFor(file, systems))
  }

  const testFiles = allFiles.filter(isTestFile)

  const consumersOf = (files: readonly string[]): readonly string[] => {
    const fileSet = new Set(files)
    const consumers = new Set<string>()
    for (const file of files) {
      for (const importer of importers.get(file) ?? []) {
        if (!fileSet.has(importer) && !isTestFile(importer)) {
          consumers.add(importer)
        }
      }
    }
    return [...consumers].sort()
  }

  const testsOf = (files: readonly string[]): readonly string[] => {
    const fileSet = new Set(files)
    const found = new Set<string>()
    for (const file of files) {
      for (const importer of importers.get(file) ?? []) {
        if (isTestFile(importer)) {
          found.add(importer)
        }
      }
      // colocated test: foo.ts -> foo.test.ts（code ファイルにのみ適用）
      if (CODE_RE.test(file)) {
        const colocated = file.replace(/\.tsx?$/, '.test.ts')
        if (fileSet.has(colocated) || testFiles.includes(colocated)) {
          found.add(colocated)
        }
      }
    }
    return [...found].sort()
  }

  const mappedSystems: MappedSystem[] = systems.map((system) => {
    const files = (systemFiles.get(system.id) ?? []).filter(
      (file) => system.id === 'tests' || !isTestFile(file),
    )
    const dependencies = new Set<string>()
    for (const file of files) {
      for (const target of directImports.get(file) ?? []) {
        const owner = systemOf.get(target)
        if (owner !== undefined && owner !== system.id) {
          dependencies.add(owner)
        }
      }
    }
    return {
      ...system,
      files: [...files].sort(),
      tests: testsOf(files),
      consumers: consumersOf(files),
      dependencies: [...dependencies].sort(),
    }
  })

  const mappedAuthorities: MappedAuthority[] = authorities.map((authority) => {
    const { files, missing } = expandPaths([
      ...authority.authority,
      ...(authority.derived ?? []),
      ...authority.mutation,
    ])
    return {
      ...authority,
      resolvedFiles: files,
      missingPaths: missing,
      consumers: consumersOf(files),
      tests: testsOf(files),
    }
  })

  const contentKinds: ContentKindSummary[] = listFilesRecursive('src/content/data')
    .filter((file) => file.endsWith('.json'))
    .reduce<ContentKindSummary[]>((acc, file) => {
      const kind = file.split('/')[3] ?? 'unknown'
      const existing = acc.find((entry) => entry.kind === kind)
      if (existing === undefined) {
        acc.push({ kind, dir: `src/content/data/${kind}/`, files: 1 })
      } else {
        acc[acc.indexOf(existing)] = { ...existing, files: existing.files + 1 }
      }
      return acc
    }, [])
    .sort((a, b) => a.kind.localeCompare(b.kind))

  return {
    version: 1,
    generatedFrom: [SYSTEMS_PATH, AUTHORITY_MAP_PATH],
    systems: mappedSystems,
    authorities: mappedAuthorities,
    contentKinds,
    fileCounts: {
      source: codeFiles.filter((file) => file.startsWith('src/')).length,
      tests: testFiles.length,
      content: contentKinds.reduce((total, kind) => total + kind.files, 0),
    },
  }
}

export const writeProjectMap = async (
  map: ProjectMap,
  path: string = PROJECT_MAP_PATH,
): Promise<void> => {
  const target = `${REPO_ROOT}/${path}`
  mkdirSync(dirname(target), { recursive: true })
  const text = `${JSON.stringify(map, null, 2)}\n`
  // 生成物も format:check（prettier）を通す。repo の .prettierrc を拾う。
  let formatted = text
  try {
    const prettier = await import('prettier')
    const config = (await prettier.resolveConfig(target)) ?? {}
    formatted = await prettier.format(text, { ...config, parser: 'json' })
  } catch {
    /* prettier 不在時は素の JSON */
  }
  writeFileSync(target, formatted)
}

export const readProjectMap = (): ProjectMap | null => {
  if (!pathExists(PROJECT_MAP_PATH)) {
    return null
  }
  return JSON.parse(readFileSync(`${REPO_ROOT}/${PROJECT_MAP_PATH}`, 'utf8')) as ProjectMap
}
