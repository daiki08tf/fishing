import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

/**
 * Content Scale の bundle レポート（Phase 15）。
 *
 * 専用の bundle analyzer dependency は入れない。dist の出力から
 * 「初期 chunk」と「Content Pack chunk」を自前で集計する。
 *
 * 判定:
 * - 初期 JS に Content の本体が入っていない（manifest の path だけ）
 * - 初期 JS が Phase 15 の目標（700 kB 以下）に入っている
 */

const INITIAL_JS_LIMIT_BYTES = 700 * 1024

export type BundleReportEntry = {
  readonly name: string
  readonly bytes: number
  readonly gzipBytes: number
}

export type BundleReport = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly initial: BundleReportEntry | null
  readonly packs: readonly BundleReportEntry[]
}

const readEntry = (assetsDir: string, file: string): BundleReportEntry => {
  const path = resolve(assetsDir, file)
  const buffer = readFileSync(path)

  return {
    name: file.replace(/-[A-Za-z0-9_-]{8}\.js$/, '').replace(/\.js$/, ''),
    bytes: statSync(path).size,
    gzipBytes: gzipSync(buffer).length,
  }
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(2)} kB`

export const analyzeContentScale = (distDir = 'dist'): BundleReport => {
  const lines: string[] = []
  const assetsDir = resolve(process.cwd(), distDir, 'assets')

  let files: readonly string[]

  try {
    files = readdirSync(assetsDir).filter((name) => name.endsWith('.js'))
  } catch {
    return {
      exitCode: 1,
      lines: [`dist not found: ${assetsDir} (run npm run build first)`],
      initial: null,
      packs: [],
    }
  }

  const entries = files.map((file) => readEntry(assetsDir, file))
  const initial = entries.find((entry) => entry.name === 'index') ?? null
  const packs = entries
    .filter((entry) => entry.name !== 'index')
    .sort((left, right) => right.bytes - left.bytes)

  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0)
  const checks: { readonly label: string; readonly ok: boolean }[] = []

  checks.push({
    label: 'initial JS chunk exists',
    ok: initial !== null,
  })
  checks.push({
    label: `initial JS <= ${kb(INITIAL_JS_LIMIT_BYTES)}（Phase 15 target）`,
    ok: initial !== null && initial.bytes <= INITIAL_JS_LIMIT_BYTES,
  })
  checks.push({
    label: 'regional Content is split into pack chunks',
    ok: packs.filter((entry) => entry.name.startsWith('region-')).length >= 5,
  })
  checks.push({
    label: 'species detail / tackle are separate packs',
    ok:
      packs.some((entry) => entry.name === 'species-detail') &&
      packs.some((entry) => entry.name === 'tackle'),
  })

  lines.push('--- bundle (dist/assets) ---')

  if (initial !== null) {
    lines.push(`Initial JS:        ${kb(initial.bytes)} (gzip ${kb(initial.gzipBytes)})`)
  }

  for (const pack of packs) {
    lines.push(`  pack ${pack.name.padEnd(26)} ${kb(pack.bytes)} (gzip ${kb(pack.gzipBytes)})`)
  }

  lines.push(`Total JS:          ${kb(total)}`)
  lines.push('')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('', allOk ? 'OK: content scale bundle looks right' : 'FAILED: bundle problems')

  return { exitCode: allOk ? 0 : 1, lines, initial, packs }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  const report = analyzeContentScale(process.argv[2] ?? 'dist')

  for (const line of report.lines) {
    process.stdout.write(`${line}\n`)
  }

  process.exitCode = report.exitCode
}
