import { buildProjectMap, readProjectMap, type ProjectMap } from './map'
import type { CommandResult } from './lib/output'

/**
 * `./dev impact <concept>` — 影響分析。
 *
 * concept は authority id でも system id でもよい。
 * 対象の authority / files / tests / consumers / save への影響を返す。
 * 静的解析ではなく generated index ベースの軽量版。
 */

const SAVE_RELATED = /save|persist|migration|schema/i

const loadMap = (): ProjectMap => readProjectMap() ?? buildProjectMap()

export const runImpact = (args: readonly string[]): CommandResult => {
  const map = loadMap()
  const concept = args.find((arg) => !arg.startsWith('-'))

  if (concept === undefined) {
    return {
      exitCode: 0,
      lines: [
        'Usage: ./dev impact <concept>',
        '',
        'authority ids:',
        ...map.authorities.map((authority) => `  ${authority.id}`),
        '',
        'system ids:',
        ...map.systems.map((system) => `  ${system.id}`),
      ],
    }
  }

  const authority = map.authorities.find((entry) => entry.id === concept)
  const system = map.systems.find(
    (entry) => entry.id === concept || entry.concepts.includes(concept),
  )

  if (authority === undefined && system === undefined) {
    return {
      exitCode: 1,
      lines: [`unknown concept: ${concept}`, 'use ./dev impact (no args) to list candidates'],
    }
  }

  const lines: string[] = [`# impact: ${concept}`, '']

  if (authority !== undefined) {
    lines.push('## authority')
    lines.push(`  ${authority.title}`)
    lines.push(`  files: ${authority.authority.join(', ')}`)
    lines.push(`  persisted: ${authority.persisted}`)
    lines.push('')
  }

  const files = authority?.resolvedFiles ?? system?.files ?? []
  const tests = authority?.tests ?? system?.tests ?? []
  const consumers = authority?.consumers ?? system?.consumers ?? []

  lines.push(`## files (${String(files.length)})`)
  const shownFiles = files.slice(0, 25)
  for (const file of shownFiles) {
    lines.push(`  ${file}`)
  }
  if (files.length > shownFiles.length) {
    lines.push(`  … +${String(files.length - shownFiles.length)} more`)
  }
  lines.push('')

  lines.push(`## tests (${String(tests.length)})`)
  for (const test of tests.slice(0, 15)) {
    lines.push(`  ${test}`)
  }
  if (tests.length > 15) {
    lines.push(`  … +${String(tests.length - 15)} more`)
  }
  lines.push('')

  lines.push(`## consumers (${String(consumers.length)})`)
  for (const consumer of consumers.slice(0, 15)) {
    lines.push(`  ${consumer}`)
  }
  if (consumers.length > 15) {
    lines.push(`  … +${String(consumers.length - 15)} more`)
  }
  lines.push('')

  const saveFiles = files.filter((file) => SAVE_RELATED.test(file))
  if (saveFiles.length > 0 || (authority?.persisted ?? '').includes('save.')) {
    lines.push('## save implications')
    lines.push(`  persisted: ${authority?.persisted ?? 'see authority map'}`)
    for (const file of saveFiles.slice(0, 8)) {
      lines.push(`  ${file}`)
    }
    lines.push('  verify: ./dev save-check')
    lines.push('')
  }

  if (authority !== undefined && authority.notes.length > 0) {
    lines.push('## notes')
    lines.push(`  ${authority.notes}`)
  }

  return { exitCode: 0, lines }
}
