import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadContentDirectory } from '../src/content/load/contentLoader'
import { validateContentReferences } from '../src/content/catalog/references'
import type { ContentKind } from '../src/content/schema'
import type { BrandDefinition } from '../src/domain/gear/Brand'
import type { GearItem } from '../src/domain/gear/Gear'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import type { FishingMethod } from '../src/domain/method/FishingMethod'
import type { ShopItem } from '../src/domain/shop/ShopItem'
import type { FishingSpot } from '../src/domain/world/FishingSpot'

/**
 * Content 検証 CLI。
 *
 * 異常があれば非ゼロで終了する。CI と `npm run check` から呼ばれる。
 * 出力は機械可読に近いプレーンテキストに留める。
 */

export const DEFAULT_CONTENT_DIR = 'src/content/data'

export type ValidateContentReport = {
  readonly exitCode: number
  readonly lines: readonly string[]
}

const parseDirectoryArgument = (argv: readonly string[]): string => {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--dir') {
      const value = argv[index + 1]
      if (value === undefined || value.length === 0) {
        throw new Error('--dir requires a path')
      }
      return value
    }

    if (argument?.startsWith('--dir=')) {
      return argument.slice('--dir='.length)
    }
  }

  return DEFAULT_CONTENT_DIR
}

export const runValidateContent = (argv: readonly string[], cwd: string): ValidateContentReport => {
  const directoryArgument = parseDirectoryArgument(argv)
  const root = resolve(cwd, directoryArgument)
  const result = loadContentDirectory(root)

  const lines: string[] = [`content root: ${root}`]

  for (const diagnostic of result.diagnostics) {
    if (diagnostic.issues.length === 0) {
      lines.push(`ERROR ${diagnostic.filePath}`)
      continue
    }

    for (const issue of diagnostic.issues) {
      const location = issue.path.length > 0 ? `#${issue.path}` : ''
      lines.push(`ERROR ${diagnostic.filePath}${location} — ${issue.message}`)
    }
  }

  lines.push(`validated ${String(result.locations.length)} record(s)`)

  if (result.locations.length === 0 && result.diagnostics.length === 0) {
    lines.push('note: no content records yet (Phase 0B intentionally ships no real-world data)')
  }

  if (result.diagnostics.length > 0) {
    lines.push(`FAILED with ${String(result.diagnostics.length)} invalid record(s)`)
    return { exitCode: 1, lines }
  }

  /*
   * 個々の形が正しくても、id の参照先が無い Content は実行時に壊れる。
   * Catalog の入口と同じ検査をここでも走らせる（Gear / Method / Brand / Shop / Spot）。
   */
  const of = <T>(kind: ContentKind): readonly T[] =>
    result.locations
      .filter((location) => location.kind === kind)
      .map((location) => location.value as T)

  const referenceIssues = validateContentReferences({
    species: of<FishSpecies>('fish-species'),
    spots: of<FishingSpot>('fishing-spots'),
    shopItems: of<ShopItem>('shop-items'),
    gear: of<GearItem>('gear'),
    methods: of<FishingMethod>('methods'),
    brands: of<BrandDefinition>('brands'),
  })

  if (referenceIssues.length > 0) {
    for (const issue of referenceIssues) {
      lines.push(`ERROR ${issue.path} — ${issue.message}`)
    }
    lines.push(`FAILED with ${String(referenceIssues.length)} broken reference(s)`)
    return { exitCode: 1, lines }
  }

  lines.push('OK')
  return { exitCode: 0, lines }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const report = runValidateContent(process.argv.slice(2), process.cwd())
    for (const line of report.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = report.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
