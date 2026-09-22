import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BuyerDefinition } from '../src/domain/trade/Buyer'
import type { ContactReward } from '../src/domain/trade/ContactReward'
import type { ExpeditionDefinition } from '../src/domain/expedition/Expedition'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import { asRegionId, type RegionId } from '../src/domain/ids'
import type { FishingSpot } from '../src/domain/world/FishingSpot'
import type { RegionDefinition } from '../src/domain/world/Region'
import type { SpeciesTradeProfile } from '../src/domain/trade/SpeciesTradeProfile'
import {
  type ContentIndex,
  type ContentPackManifestEntry,
  type RarityBand,
  type RegionSummary,
  type SpeciesCategory,
  type SpeciesSummary,
} from '../src/content/catalog/summary'
import { loadContentDirectory, type ContentLocation } from '../src/content/load/contentLoader'

/**
 * Content Index（軽量カタログ）の生成（Phase 15）。
 *
 * `src/content/data` を読み、起動時に必要な軽量索引だけを
 * `src/content/generated/content-index.json` へ書き出す。
 *
 * ここで作るのは **索引であって Content の複製ではない**。
 * 生物学の詳細・Spot の地形・Trade の tuning は含めない（それらは Content Pack）。
 * 生成物が古い場合は `validate:content` / テストが検出する。
 */

export const DEFAULT_CONTENT_ROOT = 'src/content/data'
export const DEFAULT_INDEX_PATH = 'src/content/generated/content-index.json'

/** 表示用の水域カテゴリ（新しいゲームルールではない）。 */
export const categoryOf = (waterTypes: readonly string[]): SpeciesCategory => {
  const fresh = waterTypes.includes('fresh')
  const salt = waterTypes.includes('salt')
  const brackish = waterTypes.includes('brackish')

  if (fresh && !salt && !brackish) {
    return 'freshwater'
  }

  if (salt && !fresh && !brackish) {
    return 'saltwater'
  }

  if (brackish && !fresh && !salt) {
    return 'brackish'
  }

  return 'mixed'
}

/**
 * 希少度の帯（表示用）。しきい値は Phase 15 の presentation 用で、
 * ゲームルール（Catchability 等）には使わない。
 */
export const rarityBandOf = (rarity: number): RarityBand =>
  rarity >= 3 ? 'rare' : rarity >= 1.6 ? 'uncommon' : 'common'

const of = <T>(locations: readonly ContentLocation[], kind: string): readonly T[] =>
  locations.filter((entry) => entry.kind === kind).map((entry) => entry.value as T)

/** 判定に使う安定した並び（id 昇順）。 */
const byId = <T extends { readonly id: unknown }>(entries: readonly T[]): readonly T[] =>
  [...entries].sort((left, right) => String(left.id).localeCompare(String(right.id)))

type PackWithOwnership = ContentPackManifestEntry & {
  readonly ownership?: Readonly<Record<string, readonly string[]>>
}

export const buildContentIndex = (
  root = DEFAULT_CONTENT_ROOT,
  options: { readonly cwd?: string } = {},
): ContentIndex => {
  const cwd = options.cwd ?? process.cwd()
  const absoluteRoot = resolve(cwd, root)
  const result = loadContentDirectory(absoluteRoot)

  if (result.diagnostics.length > 0) {
    const first = result.diagnostics[0]
    throw new Error(
      `content has ${String(result.diagnostics.length)} invalid record(s); first: ${first?.filePath ?? ''} ${first?.issues[0]?.message ?? ''}`,
    )
  }

  const species = of<FishSpecies>(result.locations, 'fish-species')
  const spots = of<FishingSpot>(result.locations, 'fishing-spots')
  const regions = of<RegionDefinition>(result.locations, 'regions')
  const countries = of<{ id: string; name: string }>(result.locations, 'countries')
  const buyers = of<BuyerDefinition>(result.locations, 'buyers')
  const rewards = of<ContactReward>(result.locations, 'contact-rewards')
  const expeditions = of<ExpeditionDefinition>(result.locations, 'expeditions')
  const tradeProfiles = of<SpeciesTradeProfile>(result.locations, 'species-trade-profiles')
  const gear = of<{ id: string }>(result.locations, 'gear')
  const gearSeries = of<{ id: string }>(result.locations, 'gear-series')
  const brands = of<{ id: string }>(result.locations, 'brands')
  const methods = of<{ id: string }>(result.locations, 'methods')
  const shopItems = of<{ id: string }>(result.locations, 'shop-items')
  const transports = of<{ id: string }>(result.locations, 'transports')

  const countryNameById = new Map(countries.map((entry) => [String(entry.id), entry.name]))
  const playableRegionIds = new Set(
    regions.filter((region) => region.stage === 'playable').map((region) => String(region.id)),
  )
  const packKeyOfRegion = (regionId: string): string | null =>
    playableRegionIds.has(regionId) ? `region:${regionId}` : null

  /*
   * Phase 15.1: Species detail は「その地域の釣り場に出る Species」だけを
   * region ごとの shard として持つ（1000 Species を起動時に一括で読まない）。
   * 同じ Species 定義を source 上でコピーしない（同じ JSON を複数の shard が参照する）。
   */
  const speciesByRegion = new Map<string, readonly string[]>()
  for (const regionId of [...playableRegionIds].sort()) {
    const ids = new Set<string>()
    for (const spot of spots) {
      if (String(spot.regionId) !== regionId) {
        continue
      }
      for (const occurrence of spot.fishTable) {
        ids.add(String(occurrence.speciesId))
      }
    }
    speciesByRegion.set(regionId, [...ids].sort())
  }

  const shardOfSpecies = (speciesId: string): string => {
    for (const [regionId, ids] of speciesByRegion) {
      if (ids.includes(speciesId)) {
        return `species:${regionId}`
      }
    }

    return 'species:shared'
  }

  const regionSummaries: readonly RegionSummary[] = byId(regions).map((region) => ({
    id: region.id,
    name: region.name,
    countryId: String(region.countryId),
    countryName: countryNameById.get(String(region.countryId)) ?? String(region.countryId),
    stage: region.stage,
    packKey: packKeyOfRegion(String(region.id)),
  }))

  const speciesSummaries: readonly SpeciesSummary[] = byId(species).map((entry) => ({
    id: entry.id,
    japaneseName: entry.japaneseName,
    ...(entry.scientificName === undefined ? {} : { scientificName: entry.scientificName }),
    waterTypes: entry.waterTypes,
    category: categoryOf(entry.waterTypes),
    regionIds: entry.distribution.map((region) => asRegionId(String(region))),
    habitats: entry.habitats,
    rarityBand: rarityBandOf(entry.rarity),
    detailShard: shardOfSpecies(String(entry.id)),
  }))

  /*
   * Pack 分割:
   * - region:<id> … その地域を遊ぶための Spot / Buyer / Reward / Expedition
   * - species-detail … 全 Species の詳細 + Trade profile（global identity は 1 か所だけ）
   * - tackle … Gear / Series / Brand / Method / ShopItem（地域に依存しない）
   * - world … Region / Country / Transport（軽量なので起動時に読む）
   *
   * 同じ Content を 2 つの pack へ入れない（no duplicate ownership）。
   */
  /*
   * ファイル名は必ず「そのレコードの id を持つ location の filePath」から引く
   * （ファイル名と id は一致しないことがある: kanto-maaji.json / maaji など）。
   */
  const fileOf = (kind: string, id: string, key = 'id'): readonly string[] => {
    const found = result.locations.find(
      (entry) =>
        entry.kind === kind && String((entry.value as Record<string, unknown>)[key]) === id,
    )

    return found === undefined ? [] : [relative(join(absoluteRoot, kind), found.filePath)]
  }

  const regionPacks: readonly PackWithOwnership[] = [...playableRegionIds]
    .sort()
    .map((regionId) => {
      const region = regions.find((entry) => String(entry.id) === regionId)
      const regionSpots = spots
        .filter((entry) => String(entry.regionId) === regionId)
        .flatMap((entry) => fileOf('fishing-spots', String(entry.id)))
      const regionBuyerEntries = buyers.filter((entry) => String(entry.regionId) === regionId)
      const regionBuyers = regionBuyerEntries.flatMap((entry) => fileOf('buyers', String(entry.id)))
      const regionBuyerIds = new Set(regionBuyerEntries.map((entry) => String(entry.id)))
      const regionRewards = rewards
        .filter((entry) => regionBuyerIds.has(String(entry.contactId)))
        .flatMap((entry) => fileOf('contact-rewards', String(entry.id)))
      return {
        key: `region:${regionId}`,
        kind: 'region' as const,
        label: region?.name ?? regionId,
        regionId: asRegionId(regionId),
        kinds: ['fishing-spots', 'buyers', 'contact-rewards'],
        // 実際のファイル一覧は生成される pack module が持つ（初期 chunk を増やさない）。
        ownership: {
          'fishing-spots': regionSpots,
          buyers: regionBuyers,
          'contact-rewards': regionRewards,
        },
      }
    })

  const speciesFileShard: Record<string, string> = {}
  for (const ids of speciesByRegion.values()) {
    for (const id of ids) {
      const shard = shardOfSpecies(id)
      for (const file of fileOf('fish-species', id)) {
        speciesFileShard[file] ??= shard
      }
      for (const file of fileOf('species-trade-profiles', id, 'speciesId')) {
        speciesFileShard[file] ??= shard
      }
    }
  }

  const speciesPacks: readonly PackWithOwnership[] = [...speciesByRegion]
    .filter(([, ids]) => ids.length > 0)
    .map(([regionId, ids]) => ({
      key: `species:${regionId}`,
      kind: 'species' as const,
      label: `${regions.find((entry) => String(entry.id) === regionId)?.name ?? regionId} species detail`,
      regionId: asRegionId(regionId),
      kinds: ['fish-species', 'species-trade-profiles'],
      ownership: {
        'fish-species': ids.flatMap((id) => fileOf('fish-species', id)),
        'species-trade-profiles': ids.flatMap((id) =>
          fileOf('species-trade-profiles', id, 'speciesId'),
        ),
      },
    }))

  const globalPacks: readonly PackWithOwnership[] = [
    {
      key: 'tackle',
      kind: 'global',
      label: 'Tackle catalog',
      kinds: ['gear', 'gear-series', 'brands', 'methods', 'shop-items'],
      ownership: {
        gear: gear.flatMap((entry) => fileOf('gear', String(entry.id))),
        'gear-series': gearSeries.flatMap((entry) => fileOf('gear-series', String(entry.id))),
        brands: brands.flatMap((entry) => fileOf('brands', String(entry.id))),
        methods: methods.flatMap((entry) => fileOf('methods', String(entry.id))),
        'shop-items': shopItems.flatMap((entry) => fileOf('shop-items', String(entry.id))),
      },
    },
    {
      key: 'world',
      kind: 'global',
      label: 'World basics',
      kinds: ['regions', 'countries', 'transports', 'expeditions'],
      ownership: {
        regions: regions.flatMap((entry) => fileOf('regions', String(entry.id))),
        countries: countries.flatMap((entry) => fileOf('countries', String(entry.id))),
        transports: transports.flatMap((entry) => fileOf('transports', String(entry.id))),
        // 遠征は「世界レベルの旅行定義」なので world pack（Expedition 画面が全地域を出す）。
        expeditions: expeditions.flatMap((entry) => fileOf('expeditions', String(entry.id))),
      },
    },
  ]

  return {
    generatedFrom: root,
    counts: {
      species: species.length,
      spots: spots.length,
      regions: regions.length,
      countries: countries.length,
      buyers: buyers.length,
      'contact-rewards': rewards.length,
      expeditions: expeditions.length,
      'species-trade-profiles': tradeProfiles.length,
      packs: regionPacks.length + globalPacks.length,
    },
    species: speciesSummaries,
    regions: regionSummaries,
    packs: [...regionPacks, ...speciesPacks, ...globalPacks],
    speciesShards: Object.fromEntries(
      [...speciesByRegion].map(([regionId, ids]) => [`species:${regionId}`, ids]),
    ),
    speciesFileShard,
  } as ContentIndexWithNodeData
}

/** node / 検証 / テスト専用の追加データ（browser index からは落とす）。 */
type ContentIndexWithNodeData = ContentIndex & {
  readonly speciesShards?: Readonly<Record<string, readonly string[]>>
  readonly speciesFileShard?: Readonly<Record<string, string>>
}

/** node / 検証 / テスト専用: どのファイルがどの pack に属するか。 */
/**
 * primary owner（1 ファイル = 1 主 owner）を返す。
 *
 * Species / trade profile は複数の region shard から参照され得るため、
 * `species.detailShard` が指す shard を代表（primary）とし、
 * shard 間の共有は species-shards.json（node / 検証用）で表現する。
 */
export const buildOwnership = (index: ContentIndex): Readonly<Record<string, string>> => {
  const ownership: Record<string, string> = {}
  const node = index as ContentIndexWithNodeData

  /*
   * Species / trade profile の primary owner は `speciesFileShard`（生成時に
   * id から解決したもの）を使う。ファイル名と Species id は一致しないことがある
   * （kanto-maaji.json / maaji）ので、名前からは推測しない。
   */
  for (const pack of index.packs as readonly PackWithOwnership[]) {
    if (pack.kind !== 'species') {
      continue
    }

    for (const [kind, files] of Object.entries(pack.ownership ?? {})) {
      for (const file of files) {
        const primary = node.speciesFileShard?.[file]

        if (primary === pack.key) {
          ownership[`${kind}/${file}`] = pack.key
        }
      }
    }
  }

  for (const pack of index.packs as readonly PackWithOwnership[]) {
    if (pack.kind === 'species') {
      continue
    }

    for (const [kind, files] of Object.entries(pack.ownership ?? {})) {
      for (const file of files) {
        ownership[`${kind}/${file}`] = pack.key
      }
    }
  }

  return ownership
}

/** どの Region shard がどの Species detail を持つか（node / 検証用）。 */
export const buildSpeciesShards = (
  index: ContentIndex,
): Readonly<Record<string, readonly string[]>> =>
  (index as ContentIndexWithNodeData).speciesShards ?? {}

/**
 * browser 用の pack module を 1 つ書き出す（pack 1 つ = 1 chunk）。
 *
 * JSON は **静的 import** で並べる。dynamic import を並べると
 * 「1 ファイル = 1 chunk」になって 1000 Species 規模でリクエストが破綻するため、
 * pack module 自身を dynamic import し、その中の JSON は静的に取り込む。
 */
const packModuleSource = (pack: PackWithOwnership): string => {
  const imports: string[] = []
  const names: string[] = []
  const loadEntries: string[] = []
  let counter = 0

  for (const [kind, files] of Object.entries(pack.ownership ?? {})) {
    const fileVars: string[] = []

    for (const file of files) {
      const variable = `m${String(counter)}`
      counter += 1
      imports.push(`import ${variable} from '../../data/${kind}/${file}'`)
      names.push(`export const ${variable}Name = ${JSON.stringify(file)}`)
      fileVars.push(variable)
    }

    loadEntries.push(`    ${JSON.stringify(kind)}: [${fileVars.join(', ')}],`)
  }

  return [
    '/*',
    ' * AUTO-GENERATED by scripts/build-content-index.ts（Phase 15）。',
    ' * Content Pack の読み込みは「pack 1 つ = dynamic import 1 つ」。',
    ' * ここに並ぶ JSON は、この module 自身の chunk にまとめて入る（初期 chunk を増やさない）。',
    ' */',
    '',
    ...imports,
    '',
    ...names,
    '',
    'export const load = async (): Promise<Readonly<Record<string, readonly unknown[]>>> => ({',
    ...loadEntries,
    '})',
    '',
  ].join('\n')
}

const packModuleFileName = (key: string): string => `${key.replace(':', '-')}.ts`

/** pack key → dynamic import の対応表（手で維持しない）。 */
const registrySource = (index: ContentIndex): string =>
  [
    '/*',
    ' * AUTO-GENERATED by scripts/build-content-index.ts（Phase 15）。',
    ' * pack key → dynamic import。ここには key と import 先だけを置く（初期 chunk を増やさない）。',
    ' */',
    '',
    'export type GeneratedPackModule = {',
    '  readonly load: () => Promise<Readonly<Record<string, readonly unknown[]>>>',
    '}',
    '',
    'export const PACK_MODULE_IMPORTS: Readonly<',
    '  Record<string, () => Promise<GeneratedPackModule>>',
    '> = {',
    ...index.packs.map(
      (pack) =>
        `  ${JSON.stringify(pack.key)}: () => import('./packs/${packModuleFileName(pack.key).replace(/\.ts$/, '')}'),`,
    ),
    '}',
    '',
  ].join('\n')

export const serializeContentIndex = (index: ContentIndex): string =>
  `${JSON.stringify(index, null, 2)}\n`

/**
 * ブラウザへ渡す軽量カタログ（pack の所有ファイル一覧は含めない）。
 * 初期 chunk を Content 件数に比例させないための形。freshness 検査もこれで比較する。
 */
export const browserContentIndex = (index: ContentIndex): ContentIndex => ({
  ...index,
  packs: index.packs.map((pack) => {
    const { ownership: _ownership, ...rest } = pack as PackWithOwnership
    return rest
  }),
})

export const DEFAULT_OWNERSHIP_PATH = 'src/content/generated/content-ownership.json'
export const DEFAULT_SHARDS_PATH = 'src/content/generated/species-shards.json'
export const DEFAULT_REGISTRY_PATH = 'src/content/generated/pack-registry.ts'
export const DEFAULT_PACK_DIR = 'src/content/generated/packs'

export const runBuildContentIndex = (
  argv: readonly string[] = [],
  cwd = process.cwd(),
): { readonly path: string; readonly index: ContentIndex } => {
  const root = argv[0] ?? DEFAULT_CONTENT_ROOT
  const indexPath = resolve(cwd, DEFAULT_INDEX_PATH)
  const index = buildContentIndex(root, { cwd })
  writeFileSync(indexPath, serializeContentIndex(browserContentIndex(index)))
  writeFileSync(
    resolve(cwd, DEFAULT_OWNERSHIP_PATH),
    `${JSON.stringify(buildOwnership(index), null, 2)}\n`,
  )
  writeFileSync(
    resolve(cwd, DEFAULT_SHARDS_PATH),
    `${JSON.stringify(buildSpeciesShards(index), null, 2)}\n`,
  )
  writeFileSync(resolve(cwd, DEFAULT_REGISTRY_PATH), registrySource(index))

  const packDir = resolve(cwd, DEFAULT_PACK_DIR)
  mkdirSync(packDir, { recursive: true })

  const expected = new Set(
    (index.packs as readonly PackWithOwnership[]).map((pack) => packModuleFileName(pack.key)),
  )

  // 古い pack module を残さない（pack の分割を変えたときに stale な chunk を作らない）。
  for (const file of readdirSync(packDir)) {
    if (file.endsWith('.ts') && !expected.has(file)) {
      unlinkSync(join(packDir, file))
    }
  }

  for (const pack of index.packs as readonly PackWithOwnership[]) {
    writeFileSync(join(packDir, packModuleFileName(pack.key)), packModuleSource(pack))
  }

  return { path: indexPath, index }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const { path, index } = runBuildContentIndex(process.argv.slice(2))
    process.stdout.write(`wrote ${path}\n`)
    process.stdout.write(
      `species=${String(index.counts['species'])} regions=${String(index.counts['regions'])} packs=${String(index.counts['packs'])}\n`,
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

/** content-index の生成に使う RegionId 型（他モジュールからの参照用）。 */
export type { RegionId }
