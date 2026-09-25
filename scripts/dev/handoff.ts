import { buildProjectMap, readProjectMap } from './map'
import { changedFiles, git, gitBranch, gitHead, gitStatus } from './lib/repo'
import { classifyFile } from './scope'
import type { CommandResult } from './lib/output'

/**
 * `./dev handoff` — 構造化 handoff の生成。
 *
 * 自動検出できる事実（git 状態・変更ファイル・触れた authority）は書き出し、
 * 人間/AI が書く欄は空テンプレートにする。事実を捏造しない。
 */

export const runHandoff = (args: readonly string[]): CommandResult => {
  const staged = args.includes('--staged')
  const baseIndex = args.indexOf('--base')
  const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined
  const files = changedFiles({ staged, ...(base === undefined ? {} : { base }) })
  const status = gitStatus()
  const map = readProjectMap() ?? buildProjectMap()

  const touchedAuthorities = map.authorities.filter((authority) =>
    authority.resolvedFiles.some((file) => files.includes(file)),
  )

  const categories = new Map<string, number>()
  for (const file of files) {
    const category = classifyFile(file)
    categories.set(category, (categories.get(category) ?? 0) + 1)
  }

  const recentCommits = git(['log', '--oneline', '-5']) ?? ''

  const lines: string[] = [
    '# Handoff（auto-generated skeleton）',
    '',
    `> auto-detected facts below are from git + project map at ${gitBranch()} @ ${gitHead()}.`,
    `> sections marked 【write】 are for the author — do not leave placeholders empty.`,
    '',
    '## Task intent 【write】',
    '',
    '（この変更は何を、なぜ）',
    '',
    '## Changed files (auto)',
    '',
    ...(files.length === 0
      ? ['  （working tree clean — no uncommitted changes）']
      : files.map((file) => `  ${file}`)),
    '',
    '## Scope categories (auto)',
    '',
    ...[...categories.entries()].map(([category, count]) => `  ${category}: ${String(count)}`),
    '',
    '## Authorities touched (auto)',
    '',
    ...(touchedAuthorities.length === 0
      ? ['  （none detected）']
      : touchedAuthorities.map((authority) => `  ${authority.id} — ${authority.title}`)),
    '',
    '## Behavior changes 【write】',
    '',
    '（gameplay / save / UI の振る舞いが変わるか。変わらないなら「なし」と明記）',
    '',
    '## Save impact 【write】',
    '',
    '（schemaVersion / migration / 既存 save への影響。`./dev save-check` の結果）',
    '',
    '## Validation (auto-detectable commands)',
    '',
    '  ./dev check --quick   # 編集のたび',
    '  ./dev check --full    # merge / handoff 前',
    '  ./dev save-check      # save を触ったとき',
    '  ./dev smoke           # 釣行ループの決定性',
    '',
    '## Working tree (auto)',
    '',
    ...(status.length === 0 ? ['  clean'] : status.map((line) => `  ${line}`)),
    '',
    '## Recent commits (auto)',
    '',
    ...recentCommits.split('\n').map((line) => `  ${line}`),
    '',
    '## Known limitations 【write】',
    '',
    '## Next action 【write】',
  ]

  return { exitCode: 0, lines }
}
