import { buildProjectMap, readProjectMap } from './map'
import type { CommandResult } from './lib/output'

/**
 * `./dev context <concept>` — AI agent 用の軽量コンテキスト生成。
 *
 * リポジトリ全体を渡さず、その概念に関係する authority / files / tests /
 * invariants / docs / 既知の注意点だけを返す。
 */

export const runContext = (args: readonly string[]): CommandResult => {
  const map = readProjectMap() ?? buildProjectMap()
  const concept = args.find((arg) => !arg.startsWith('-'))

  if (concept === undefined) {
    return {
      exitCode: 0,
      lines: [
        'Usage: ./dev context <concept>',
        '',
        'concepts:',
        ...map.authorities.map((authority) => `  ${authority.id} — ${authority.title}`),
        '',
        'systems:',
        ...map.systems.map((system) => `  ${system.id}`),
      ],
    }
  }

  const authority = map.authorities.find((entry) => entry.id === concept)
  const systems = map.systems.filter(
    (system) => system.concepts.includes(concept) || system.id === concept,
  )

  if (authority === undefined && systems.length === 0) {
    return {
      exitCode: 1,
      lines: [`unknown concept: ${concept}`, 'use ./dev context (no args) to list'],
    }
  }

  const lines: string[] = [`# context: ${concept}`, '']

  if (authority !== undefined) {
    lines.push('## authority')
    lines.push(authority.title)
    lines.push(`  source of truth: ${authority.authority.join(', ')}`)
    if (authority.derived !== undefined && authority.derived.length > 0) {
      lines.push(`  derived: ${authority.derived.join(', ')}`)
    }
    lines.push(`  persisted: ${authority.persisted}`)
    lines.push(`  mutation points: ${authority.mutation.join(', ')}`)
    lines.push(`  validation: ${authority.validation}`)
    lines.push('')
    lines.push('## notes / invariants')
    lines.push(authority.notes)
    lines.push('')
  }

  for (const system of systems) {
    lines.push(`## system: ${system.id} — ${system.title}`)
    if (system.docs.length > 0) {
      lines.push(`  docs: ${system.docs.join(', ')}`)
    }
    lines.push(`  files (${String(system.files.length)}):`)
    for (const file of system.files.slice(0, 20)) {
      lines.push(`    ${file}`)
    }
    if (system.files.length > 20) {
      lines.push(`    … +${String(system.files.length - 20)}`)
    }
    if (system.tests.length > 0) {
      lines.push(`  tests (${String(system.tests.length)}):`)
      for (const test of system.tests.slice(0, 10)) {
        lines.push(`    ${test}`)
      }
      if (system.tests.length > 10) {
        lines.push(`    … +${String(system.tests.length - 10)}`)
      }
    }
    lines.push('')
  }

  const consumers = authority?.consumers ?? systems[0]?.consumers ?? []
  if (consumers.length > 0) {
    lines.push(`## consumers（変更すると壊れうる側）`)
    for (const consumer of consumers.slice(0, 10)) {
      lines.push(`  ${consumer}`)
    }
    if (consumers.length > 10) {
      lines.push(`  … +${String(consumers.length - 10)}`)
    }
    lines.push('')
  }

  lines.push('## verify')
  lines.push(`  ./dev check          # quick: typecheck+lint+format+content+save+smoke+tests`)
  if ((authority?.persisted ?? '').includes('save')) {
    lines.push(`  ./dev save-check     # save migration round-trip`)
  }
  lines.push(`  ./dev impact ${concept}   # 影響範囲の確認`)

  return { exitCode: 0, lines }
}
