import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { bootPackKeys } from '../src/content/runtime/contentRuntime'

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

const INITIAL_JS_LIMIT_BYTES = 700_000

/**
 * Phase 14（全 Content が 1 chunk）と Phase 15.0（起動時に全 species/tackle を読む）
 * の実測値。boot bytes を比較するための基準として残す。
 */
export const PHASE_14_BASELINE = { raw: 925_440, gzip: 216_480 } as const
export const PHASE_15_0_BOOT = { raw: 871_380, gzip: 210_510 } as const
/** Phase 15.2（Phase 16 前）の実測。catalog が Species 数に比例する分だけ増えることを示す。 */
const PHASE_15_2_BOOT = { raw: 604_930, gzip: 170_620 } as const
/**
 * Phase 16 の起動 gzip 予算。
 *
 * Phase 15 の目標は「Phase 14 の 80% 以下」だったが、Phase 16 で Species が 82 → 144 に
 * 増えたため、**軽量カタログ自体が Species 数に比例して増える**（Codex / 検索の索引なので
 * 意図どおり）。したがって比率ではなく予算で管理し、内訳（catalog / region / species shard）を
 * 併記して説明できるようにする。
 */
const BOOT_GZIP_BUDGET_BYTES = 200_000

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

// Vite の build 出力と同じ十進 kB で表示する。
const kb = (bytes: number): string => `${(bytes / 1000).toFixed(2)} kB`

/** chunk が静的に読み込む他 chunk（boot の実効 bytes を数えるため）。 */
const staticImportsOf = (assetsDir: string, file: string): readonly string[] => {
  const source = readFileSync(resolve(assetsDir, file), 'utf8')
  const names = new Set<string>()

  for (const match of source.matchAll(/from\s*"\.\/([A-Za-z0-9_-]+\.js)"/g)) {
    if (match[1] !== undefined) {
      names.add(match[1])
    }
  }

  for (const match of source.matchAll(/import\s*"\.\/([A-Za-z0-9_-]+\.js)"/g)) {
    if (match[1] !== undefined) {
      names.add(match[1])
    }
  }

  return [...names]
}

/** 起動時に必要な chunk（初期 + 初期 pack + それらが静的に読む chunk）。 */
export const bootChunks = (
  assetsDir: string,
  files: readonly string[],
  regionId: string,
): readonly string[] => {
  const boot = new Set<string>()
  const queue: string[] = []

  const indexFile = files.find((file) => file.startsWith('index-'))

  if (indexFile !== undefined) {
    boot.add(indexFile)
  }

  for (const file of files) {
    if (
      file.startsWith('world-') ||
      file.startsWith(`region-${regionId}-`) ||
      file.startsWith(`species-${regionId}-`)
    ) {
      boot.add(file)
      queue.push(file)
    }
  }

  while (queue.length > 0) {
    const current = queue.pop()

    if (current === undefined) {
      continue
    }

    for (const imported of staticImportsOf(assetsDir, current)) {
      if (!boot.has(imported) && files.includes(imported)) {
        boot.add(imported)
        queue.push(imported)
      }
    }
  }

  return [...boot]
}

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
  const bootFiles = bootChunks(assetsDir, files, 'tokyo-area')
  const bootEntries = bootFiles.map((file) => readEntry(assetsDir, file))
  const bootRaw = bootEntries.reduce((sum, entry) => sum + entry.bytes, 0)
  const bootGzip = bootEntries.reduce((sum, entry) => sum + entry.gzipBytes, 0)
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
    label: `boot gzip <= ${(BOOT_GZIP_BUDGET_BYTES / 1000).toFixed(0)} kB（Phase 16 budget）`,
    ok: bootGzip <= BOOT_GZIP_BUDGET_BYTES,
  })
  checks.push({
    label: 'boot path does not include tackle / other regions',
    ok: !bootFiles.some(
      (file) =>
        file.startsWith('tackle-') ||
        file.startsWith('region-hokkaido-') ||
        file.startsWith('species-hokkaido-'),
    ),
  })
  checks.push({
    label: 'species detail shards / tackle are separate packs',
    ok:
      packs.some((entry) => entry.name.startsWith('species-')) &&
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
  lines.push('--- boot critical path (catalog + world + current region + its species) ---')
  lines.push(`Boot packs (AppShell bootstrap): ${bootPackKeys('tokyo-area').join(', ')}`)
  lines.push(`Boot chunks (${String(bootEntries.length)}):`)
  for (const entry of bootEntries.sort((left, right) => right.bytes - left.bytes)) {
    lines.push(`  ${entry.name.padEnd(26)} ${kb(entry.bytes)} (gzip ${kb(entry.gzipBytes)})`)
  }
  lines.push(`Total boot raw:    ${kb(bootRaw)}（Phase 14 ${kb(PHASE_14_BASELINE.raw)}）`)
  lines.push(
    `Total boot gzip:   ${kb(bootGzip)}（Phase 14 ${kb(PHASE_14_BASELINE.gzip)} / Phase 15.0 ${kb(PHASE_15_0_BOOT.gzip)} / Phase 15.2 ${kb(PHASE_15_2_BOOT.gzip)}）`,
  )
  lines.push(
    `boot vs Phase 14:  raw ${((bootRaw / PHASE_14_BASELINE.raw) * 100).toFixed(1)}% / gzip ${((bootGzip / PHASE_14_BASELINE.gzip) * 100).toFixed(1)}%（catalog は Species 数に比例する）`,
  )
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
