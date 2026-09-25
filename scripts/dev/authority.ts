import { buildProjectMap, readProjectMap, type MappedAuthority } from './map'
import type { CommandResult } from './lib/output'

/**
 * `./dev authority [concept]` — authority map の閲覧。
 * 引数なし: 一覧。引数あり: 1 件の詳細。
 */

const loadAuthorities = (): readonly MappedAuthority[] =>
  (readProjectMap() ?? buildProjectMap()).authorities

const formatAuthority = (authority: MappedAuthority): readonly string[] => [
  `# ${authority.id} — ${authority.title}`,
  '',
  `authority:   ${authority.authority.join(', ')}`,
  ...(authority.derived !== undefined && authority.derived.length > 0
    ? [`derived:     ${authority.derived.join(', ')}`]
    : []),
  `persisted:   ${authority.persisted}`,
  `mutation:    ${authority.mutation.join(', ')}`,
  `validation:  ${authority.validation}`,
  `tests:       ${authority.tests.length} 件`,
  `consumers:   ${String(authority.consumers.length)} ファイル`,
  ...(authority.missingPaths.length > 0
    ? [`MISSING:     ${authority.missingPaths.join(', ')}`]
    : []),
  '',
  authority.notes,
]

export const runAuthority = (args: readonly string[]): CommandResult => {
  const authorities = loadAuthorities()

  const concept = args.find((arg) => !arg.startsWith('-'))
  const check = args.includes('--check')

  if (check) {
    const missing = authorities.flatMap((authority) =>
      authority.missingPaths.map((path) => `${authority.id}: ${path}`),
    )
    if (missing.length === 0) {
      return {
        exitCode: 0,
        lines: [`OK: ${String(authorities.length)} authorities, all paths exist`],
      }
    }
    return {
      exitCode: 1,
      lines: [`FAIL: ${String(missing.length)} broken paths`, ...missing],
    }
  }

  if (concept === undefined) {
    return {
      exitCode: 0,
      lines: [
        'Authorities（./dev authority <id> で詳細）:',
        '',
        ...authorities.map((authority) => `  ${authority.id.padEnd(22)} ${authority.title}`),
      ],
    }
  }

  const found = authorities.find((authority) => authority.id === concept)
  if (found === undefined) {
    return {
      exitCode: 1,
      lines: [
        `unknown authority: ${concept}`,
        '',
        'candidates:',
        ...authorities.map((authority) => `  ${authority.id}`),
      ],
    }
  }

  return { exitCode: 0, lines: formatAuthority(found) }
}
