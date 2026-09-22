import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadContentDirectory, type ContentLocation } from '../src/content/load/contentLoader'
import { validateContentReferences } from '../src/content/catalog/references'
import type { ContentKind } from '../src/content/schema'
import type { BrandDefinition } from '../src/domain/gear/Brand'
import type { GearItem } from '../src/domain/gear/Gear'
import type { GearSeries } from '../src/domain/gear/GearSeries'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import type { FishingMethod } from '../src/domain/method/FishingMethod'
import type { ShopItem } from '../src/domain/shop/ShopItem'
import type { FishingSpot } from '../src/domain/world/FishingSpot'
import type { TransportDefinition } from '../src/domain/access/Transport'
import type { ExpeditionDefinition } from '../src/domain/expedition/Expedition'
import type { Country, RegionDefinition } from '../src/domain/world/Region'
import type { BuyerDefinition } from '../src/domain/trade/Buyer'
import type { SpeciesTradeProfile } from '../src/domain/trade/SpeciesTradeProfile'
import type { ContactReward } from '../src/domain/trade/ContactReward'
import { validateContentScale } from '../src/content/catalog/scaleCheck'
import type { ContentIndex } from '../src/content/catalog/summary'
import {
  browserContentIndex,
  buildContentIndex,
  serializeContentIndex,
} from './build-content-index'
import { knownPackModuleKeys } from '../src/content/runtime/packModules'

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
    gearSeries: of<GearSeries>('gear-series'),
    transports: of<TransportDefinition>('transports'),
    countries: of<Country>('countries'),
    regions: of<RegionDefinition>('regions'),
    expeditions: of<ExpeditionDefinition>('expeditions'),
    buyers: of<BuyerDefinition>('buyers'),
    speciesTradeProfiles: of<SpeciesTradeProfile>('species-trade-profiles'),
    contactRewards: of<ContactReward>('contact-rewards'),
  })

  if (referenceIssues.length > 0) {
    for (const issue of referenceIssues) {
      lines.push(`ERROR ${issue.path} — ${issue.message}`)
    }
    lines.push(`FAILED with ${String(referenceIssues.length)} broken reference(s)`)
    return { exitCode: 1, lines }
  }

  /*
   * Phase 13.1: **runtime Content の完全性**。
   *
   * 「全 runtime Species が SpeciesTradeProfile を持つ」は、参照整合性の検査
   * （validateContentReferences）には置けない。テスト / simulation は検証用 fixture の
   * 魚種を追加で読み込むため、必ず食い違うからである（Phase 10.1 の分離方針）。
   * ここは runtime の `src/content/data` だけを見る CLI なので、完全性を検査できる。
   */
  const runtimeSpecies = of<FishSpecies>('fish-species')
  const tradeProfiles = of<SpeciesTradeProfile>('species-trade-profiles')
  /*
   * 部分的な Content 集合（Tackle 専用の検証用 fixture など）には
   * species-trade-profiles が無い。その場合は完全性を検査しない
   * （既存の「transports がある時だけ route を見る」と同じ扱い）。
   */
  if (tradeProfiles.length > 0) {
    const tradeProfileIds = new Set(tradeProfiles.map((profile) => String(profile.speciesId)))
    const missingTradeProfiles = runtimeSpecies.filter(
      (species) => !tradeProfileIds.has(String(species.id)),
    )

    if (missingTradeProfiles.length > 0) {
      for (const species of missingTradeProfiles) {
        lines.push(
          `ERROR species-trade-profiles/${String(species.id)} — runtime species has no trade profile`,
        )
      }
      lines.push(
        `FAILED: ${String(missingTradeProfiles.length)} runtime species without a trade profile`,
      )
      return { exitCode: 1, lines }
    }

    lines.push(`trade profiles cover all ${String(runtimeSpecies.length)} runtime species`)
  }

  /*
   * Phase 15: Content Scale の検証。
   * runtime Content（既定ディレクトリ）のときだけ、生成済みカタログ / pack と突き合わせる。
   * 部分的な fixture 集合では pack 境界の検査はできない。
   */
  if (directoryArgument === DEFAULT_CONTENT_DIR) {
    const scaleIssues = runContentScaleValidation({
      root,
      locations: result.locations,
      index: JSON.parse(
        readFileSync(resolve(cwd, 'src/content/generated/content-index.json'), 'utf8'),
      ) as ContentIndex,
      ownership: JSON.parse(
        readFileSync(resolve(cwd, 'src/content/generated/content-ownership.json'), 'utf8'),
      ) as Record<string, string>,
      packModuleKeys: knownPackModuleKeys(),
      cwd,
    })

    if (scaleIssues.length > 0) {
      for (const issue of scaleIssues) {
        lines.push(`ERROR ${issue.path} — ${issue.message}`)
      }
      lines.push(`FAILED with ${String(scaleIssues.length)} content scale issue(s)`)
      return { exitCode: 1, lines }
    }

    lines.push('content scale: catalog / packs / ownership / manifest OK')
  }

  lines.push('OK')
  return { exitCode: 0, lines }
}

/**
 * Content Scale 検証（Phase 15）。
 * 生成物（index / ownership）が Content と一致しているかも含めて検査する。
 */
export const runContentScaleValidation = (input: {
  readonly root: string
  readonly locations: readonly ContentLocation[]
  readonly index: ContentIndex
  readonly ownership: Readonly<Record<string, string>>
  readonly packModuleKeys: readonly string[]
  readonly cwd: string
}): readonly { readonly path: string; readonly message: string }[] => {
  const of = <T>(kind: ContentKind): readonly T[] =>
    input.locations.filter((entry) => entry.kind === kind).map((entry) => entry.value as T)

  const filesByKind: Record<string, string[]> = {}
  for (const entry of input.locations) {
    const kindDirectory = resolve(input.root, entry.kind)
    filesByKind[entry.kind] = [
      ...(filesByKind[entry.kind] ?? []),
      relative(kindDirectory, entry.filePath),
    ]
  }

  const issues = [
    ...validateContentScale({
      species: of<FishSpecies>('fish-species'),
      spots: of<FishingSpot>('fishing-spots'),
      regions: of<RegionDefinition>('regions'),
      buyers: of<BuyerDefinition>('buyers'),
      contactRewards: of<ContactReward>('contact-rewards'),
      expeditions: of<ExpeditionDefinition>('expeditions'),
      speciesTradeProfiles: of<SpeciesTradeProfile>('species-trade-profiles'),
      index: input.index,
      ownership: input.ownership,
      filesByKind,
      packModuleKeys: input.packModuleKeys,
    }),
  ]

  // 生成物が古くないか（index を再生成して比較する）。
  const regenerated = serializeContentIndex(
    browserContentIndex(buildContentIndex(DEFAULT_CONTENT_DIR, { cwd: input.cwd })),
  )
  const committed = readFileSync(
    resolve(input.cwd, 'src/content/generated/content-index.json'),
    'utf8',
  )

  if (regenerated !== committed) {
    issues.push({
      path: 'content-index',
      message: 'generated content index is stale (run npm run content:index)',
    })
  }

  return issues
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
