import { buildProjectMap, readProjectMap } from './map'
import { changedFiles, git } from './lib/repo'
import type { CommandResult } from './lib/output'

/**
 * `./dev scope [--staged|--base <ref>]` — 変更範囲の分類。
 *
 * git diff が触れている system / authority を分類し、
 * 「infrastructure タスクなのに gameplay authority を触っている」ような
 * 範囲外変更に気づくための可視化を行う。自動 reject はしない。
 */

export type ScopeCategory =
  | 'gameplay-domain'
  | 'content'
  | 'save'
  | 'ui'
  | 'tests'
  | 'infrastructure'
  | 'docs'
  | 'devtools'
  | 'other'

export const classifyFile = (path: string): ScopeCategory => {
  if (/^src\/domain\/(save)\//.test(path) || /^src\/infrastructure\/persistence\//.test(path)) {
    return 'save'
  }
  if (path.startsWith('src/domain/')) {
    return 'gameplay-domain'
  }
  if (path.startsWith('src/content/')) {
    return 'content'
  }
  if (path.startsWith('src/ui/') || path === 'index.html' || path === 'src/main.tsx') {
    return 'ui'
  }
  if (path.startsWith('tests/') || /\.test\.tsx?$/.test(path)) {
    return 'tests'
  }
  if (
    path.startsWith('src/state/') ||
    path.startsWith('src/app/') ||
    path.startsWith('src/infrastructure/')
  ) {
    return 'infrastructure'
  }
  if (
    path.startsWith('scripts/') ||
    path === 'dev' ||
    path.startsWith('.dev/') ||
    path.startsWith('.github/')
  ) {
    return 'devtools'
  }
  if (/\.md$/.test(path) || path.startsWith('docs/')) {
    return 'docs'
  }
  return 'other'
}

export const runScope = (args: readonly string[]): CommandResult => {
  const staged = args.includes('--staged')
  const baseIndex = args.indexOf('--base')
  const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined

  const files = changedFiles({ staged, ...(base === undefined ? {} : { base }) })

  if (files.length === 0) {
    return { exitCode: 0, lines: ['no changed files (working tree clean)'] }
  }

  const byCategory = new Map<ScopeCategory, string[]>()
  for (const file of files) {
    const category = classifyFile(file)
    byCategory.set(category, [...(byCategory.get(category) ?? []), file])
  }

  const map = readProjectMap() ?? buildProjectMap()

  // 触れられた authority を特定する。
  const touchedAuthorities = map.authorities.filter((authority) =>
    authority.resolvedFiles.some((file) => files.includes(file)),
  )

  const lines: string[] = [
    `# change scope（${staged ? '--staged' : base !== undefined ? `--base ${base}` : 'working tree'}）`,
    '',
  ]

  const order: ScopeCategory[] = [
    'gameplay-domain',
    'content',
    'save',
    'ui',
    'infrastructure',
    'tests',
    'devtools',
    'docs',
    'other',
  ]
  for (const category of order) {
    const list = byCategory.get(category)
    if (list === undefined || list.length === 0) {
      continue
    }
    lines.push(`${category} (${String(list.length)})`)
    for (const file of list.slice(0, 20)) {
      lines.push(`  ${file}`)
    }
    if (list.length > 20) {
      lines.push(`  … +${String(list.length - 20)} more`)
    }
    lines.push('')
  }

  if (touchedAuthorities.length > 0) {
    lines.push('authorities touched:')
    for (const authority of touchedAuthorities) {
      lines.push(`  ${authority.id} — ${authority.title}`)
    }
    lines.push('')
  }

  const gameplayFiles = byCategory.get('gameplay-domain') ?? []
  const saveFiles = byCategory.get('save') ?? []
  if (saveFiles.length > 0) {
    lines.push(
      `NOTE: save/persistence ファイル ${String(saveFiles.length)} 件 — ./dev save-check を推奨`,
    )
  }
  if (gameplayFiles.length > 0) {
    lines.push(
      `NOTE: gameplay-domain ファイル ${String(gameplayFiles.length)} 件 — invariants と ./dev check --full を推奨`,
    )
  }

  const diffStat = git([
    'diff',
    '--stat',
    ...(staged ? ['--cached'] : base !== undefined ? [base] : ['HEAD']),
  ])
  if (diffStat !== null) {
    lines.push('')
    lines.push(diffStat.split('\n').pop() ?? '')
  }

  return { exitCode: 0, lines }
}
