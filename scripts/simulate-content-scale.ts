import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { asRegionId, asFishSpeciesId } from '../src/domain/ids'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import {
  CODEX_PAGE_SIZE,
  filterSpeciesSummaries,
  paginateSummaries,
} from '../src/content/catalog/speciesSearch'
import { validateContentScale } from '../src/content/catalog/scaleCheck'
import type { SpeciesSummary } from '../src/content/catalog/summary'
import { buildContentIndex } from './build-content-index'
import { knownPackModuleKeys } from '../src/content/runtime/packModules'

/**
 * Content Scale の検証（Phase 15）。
 *
 * 1. Production Content（82 Species / 53 Spot / 5 playable Region）が
 *    軽量カタログと Content Pack で正しく表現されているか。
 * 2. 1000/1500 件の synthetic summary で、一覧・検索・絞り込み・ページングが
 *    破綻しないか（同じ `speciesSearch` を使う）。
 *
 * 壁時計時間は「参考値」として出すだけで、test failure の条件にはしない。
 */

export type ContentScaleCheck = {
  readonly label: string
  readonly ok: boolean
}

export type ContentScaleResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly ContentScaleCheck[]
}

const SYNTHETIC_COUNT = 1000
const SYNTHETIC_LARGE_COUNT = 1500

const REGION_IDS = ['tokyo-area', 'hokkaido', 'alaska', 'british-columbia', 'queensland'] as const
const WATER_TYPES = ['fresh', 'salt', 'brackish'] as const

/** deterministic な synthetic SpeciesSummary を作る（本物の Content には入れない）。 */
export const buildSyntheticSummaries = (
  count: number,
  seed = 'content-scale',
): readonly SpeciesSummary[] => {
  const random = new SeededRandomSource(seed)
  const summaries: SpeciesSummary[] = []

  for (let index = 0; index < count; index += 1) {
    const id = asFishSpeciesId(`synthetic-${String(index).padStart(5, '0')}`)
    const waterTypes = [WATER_TYPES[random.int(0, WATER_TYPES.length - 1)] ?? 'salt']
    const regionCount = random.int(1, 3)
    const regionIds = [
      ...new Set(
        Array.from(
          { length: regionCount },
          () => REGION_IDS[random.int(0, REGION_IDS.length - 1)] ?? 'tokyo-area',
        ),
      ),
    ].map((regionId) => asRegionId(regionId))

    summaries.push({
      id,
      japaneseName: `テスト魚${String(index).padStart(5, '0')}（暫定）`,
      englishName: `Synthetic Fish ${String(index).padStart(5, '0')}`,
      waterTypes,
      category:
        waterTypes[0] === 'fresh'
          ? 'freshwater'
          : waterTypes[0] === 'brackish'
            ? 'brackish'
            : 'saltwater',
      regionIds,
      habitats: ['synthetic'],
      rarityBand: index % 10 === 0 ? 'rare' : 'common',
      detailShard: `species:${REGION_IDS[index % REGION_IDS.length] ?? 'tokyo-area'}`,
    })
  }

  return summaries
}

export const simulateContentScale = (): ContentScaleResult => {
  const checks: ContentScaleCheck[] = []
  const lines: string[] = []
  const push = (label: string, ok: boolean): void => {
    checks.push({ label, ok })
  }

  const content = loadContentFromDirectory()
  const index = buildContentIndex()

  // --- 1. Production ---
  lines.push(
    `production species=${String(content.species.length)} regions=${String(content.regions.length)} spots=${String(content.spots.length)}`,
  )
  lines.push(
    `region packs=${String(index.packs.filter((pack) => pack.kind === 'region').length)} species shards=${String(index.packs.filter((pack) => pack.kind === 'species').length)} global packs=${String(index.packs.filter((pack) => pack.kind === 'global').length)} catalog entries=${String(index.species.length + index.regions.length)}`,
  )

  const shards = index.speciesShards ?? {}
  const tokyoShard = shards['species:tokyo-area'] ?? []
  lines.push(
    `species shards: ${Object.entries(shards)
      .map(([key, ids]) => `${key.replace('species:', '')}=${String(ids.length)}`)
      .join(' ')}`,
  )
  lines.push(
    `startup (catalog + world + tokyo-area region + ${String(tokyoShard.length)} species) は全 ${String(index.species.length)} species detail を読まない`,
  )

  const scaleIssues = validateContentScale({
    species: content.species,
    spots: content.spots,
    regions: content.regions,
    buyers: content.buyers,
    contactRewards: content.contactRewards,
    expeditions: content.expeditions,
    speciesTradeProfiles: content.speciesTradeProfiles,
    index,
    // ownership / shards は node / 検証専用の生成物（browser bundle には入らない）。
    ownership: JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/content/generated/content-ownership.json'), 'utf8'),
    ) as Record<string, string>,
    speciesShards: JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/content/generated/species-shards.json'), 'utf8'),
    ) as Record<string, readonly string[]>,
    filesByKind: {},
    packModuleKeys: knownPackModuleKeys(),
  })

  push(
    'canonical Species ID は global（地域 prefix なし）',
    scaleIssues.every((issue) => !issue.message.includes('regional prefix')),
  )
  push(
    'pack manifest と生成 pack module が一致する',
    scaleIssues.every(
      (issue) =>
        !issue.message.includes('pack module') && !issue.message.includes('no generated module'),
    ),
  )
  push(
    '全 playable Region に content pack がある',
    index.regions
      .filter((region) => region.stage === 'playable')
      .every((region) => region.packKey !== null),
  )
  push('全 runtime Species に軽量 summary がある', index.species.length >= content.species.length)
  push(
    'Region shard は「その地域に必要な Species」だけを持つ',
    Object.entries(shards).every(([, ids]) => ids.length > 0 && ids.length < index.species.length),
  )
  push(
    'Tokyo の起動で読む Species は全 Species より少ない',
    tokyoShard.length > 0 && tokyoShard.length < index.species.length,
  )
  push(
    '軽量カタログに生物学の詳細が入っていない',
    scaleIssues.every((issue) => !issue.message.includes('lightweight')),
  )

  // --- 2. Synthetic 1000 / 1500 ---
  const synthetic = buildSyntheticSummaries(SYNTHETIC_COUNT)
  const large = buildSyntheticSummaries(SYNTHETIC_LARGE_COUNT, 'content-scale-large')

  push(
    `${String(SYNTHETIC_COUNT)} 件の synthetic summary を作れる`,
    synthetic.length === SYNTHETIC_COUNT,
  )
  push(`${String(SYNTHETIC_LARGE_COUNT)} 件でも作れる`, large.length === SYNTHETIC_LARGE_COUNT)

  const idSet = new Set(synthetic.map((summary) => String(summary.id)))
  push('synthetic の id が重複しない', idSet.size === synthetic.length)

  const startSearch = performance.now()
  const byJapanese = filterSpeciesSummaries(synthetic, { query: 'テスト魚00042' })
  const byEnglish = filterSpeciesSummaries(synthetic, { query: 'Synthetic Fish 00042' })
  const byId = filterSpeciesSummaries(synthetic, { query: 'synthetic-00042' })
  const searchMs = performance.now() - startSearch

  push(
    '日本語名で 1 件に絞れる',
    byJapanese.length === 1 && String(byJapanese[0]?.id) === 'synthetic-00042',
  )
  push(
    '英語名で 1 件に絞れる',
    byEnglish.length === 1 && String(byEnglish[0]?.id) === 'synthetic-00042',
  )
  push('id でも引ける', byId.length === 1 && String(byId[0]?.id) === 'synthetic-00042')

  const caught = new Set(synthetic.slice(0, 250).map((summary) => String(summary.id)))
  const caughtFiltered = filterSpeciesSummaries(synthetic, {
    catchFilter: 'caught',
    caughtIds: caught,
  })
  const uncaughtFiltered = filterSpeciesSummaries(synthetic, {
    catchFilter: 'uncaught',
    caughtIds: caught,
  })
  push('caught フィルタが正しい', caughtFiltered.length === caught.size)
  push(
    'uncaught フィルタが正しい',
    uncaughtFiltered.length === synthetic.length - caught.size &&
      uncaughtFiltered.every((summary) => !caught.has(String(summary.id))),
  )

  for (const regionId of REGION_IDS) {
    const expected = synthetic.filter((summary) =>
      summary.regionIds.some((id) => String(id) === regionId),
    ).length
    const actual = filterSpeciesSummaries(synthetic, { regionId }).length
    push(`region フィルタが正しい（${regionId}）`, actual === expected)
  }

  const freshCount = filterSpeciesSummaries(synthetic, { waterType: 'fresh' }).length
  const expectedFresh = synthetic.filter((summary) => summary.waterTypes.includes('fresh')).length
  push('water type フィルタが正しい', freshCount === expectedFresh)

  const combined = filterSpeciesSummaries(synthetic, {
    query: 'テスト魚000',
    catchFilter: 'uncaught',
    caughtIds: caught,
    regionId: 'hokkaido',
  })
  const expectedCombined = synthetic.filter(
    (summary) =>
      summary.japaneseName.includes('テスト魚000') &&
      !caught.has(String(summary.id)) &&
      summary.regionIds.some((id) => String(id) === 'hokkaido'),
  ).length
  push('複合条件（検索 + caught + region）が正しい', combined.length === expectedCombined)

  const page = paginateSummaries(synthetic, CODEX_PAGE_SIZE)
  push(
    'ページングは初期 60 件だけを返す',
    page.visible.length === 60 && page.hasMore && page.total === synthetic.length,
  )

  const lastPage = paginateSummaries(synthetic, synthetic.length)
  push(
    '最終ページは全件を返し hasMore=false',
    lastPage.visible.length === synthetic.length && !lastPage.hasMore,
  )

  const tooMany = paginateSummaries(synthetic, synthetic.length + 500)
  push('要求件数が多すぎても落ちない', tooMany.shown === synthetic.length && !tooMany.hasMore)

  lines.push(
    `synthetic search (${String(SYNTHETIC_COUNT)} summaries): ${searchMs.toFixed(2)} ms（参考値。合否判定には使わない）`,
  )
  lines.push('')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push(
    '',
    allOk ? 'OK: content scale foundation is healthy' : 'FAILED: content scale problems',
  )

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateContentScale()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
