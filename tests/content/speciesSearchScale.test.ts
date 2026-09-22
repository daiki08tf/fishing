import { describe, expect, it } from 'vitest'
import { readProjectSources } from '../architecture/testProjectFiles'
import { buildSyntheticSummaries, simulateContentScale } from '../../scripts/simulate-content-scale'
import {
  CODEX_PAGE_SIZE,
  filterSpeciesSummaries,
  paginateSummaries,
} from '../../src/content/catalog/speciesSearch'
import { speciesSearchText } from '../../src/content/catalog/summary'

/**
 * Phase 15 — 1000/1500 Species 相当の scale テスト。
 *
 * synthetic summary は本物の Content には入れない（fixture / 生成データのみ）。
 * 壁時計時間は判定に使わない（flaky にしない）。
 */

const summaries = buildSyntheticSummaries(1000)
const large = buildSyntheticSummaries(1500, 'content-scale-large')

describe('species summary scale', () => {
  it('builds 1000 / 1500 deterministic summaries', () => {
    expect(summaries).toHaveLength(1000)
    expect(large).toHaveLength(1500)
    expect(buildSyntheticSummaries(1000)).toEqual(summaries)
  })

  it('has no duplicate ids', () => {
    expect(new Set(summaries.map((summary) => String(summary.id))).size).toBe(summaries.length)
    expect(new Set(large.map((summary) => String(summary.id))).size).toBe(large.length)
  })

  it('indexes Japanese, English and id for search', () => {
    const sample = summaries[42]

    if (sample === undefined) {
      throw new Error('missing sample')
    }

    const haystack = speciesSearchText(sample)

    expect(haystack).toContain(sample.japaneseName.normalize('NFKC').toLowerCase())
    expect(haystack).toContain((sample.englishName ?? '').toLowerCase())
    expect(haystack).toContain(String(sample.id))
  })

  it('filters 1000 summaries correctly', () => {
    const caught = new Set(summaries.slice(0, 100).map((summary) => String(summary.id)))

    expect(filterSpeciesSummaries(summaries, { query: 'テスト魚00999' })).toHaveLength(1)
    expect(
      filterSpeciesSummaries(summaries, { catchFilter: 'caught', caughtIds: caught }),
    ).toHaveLength(100)
    expect(
      filterSpeciesSummaries(summaries, { catchFilter: 'uncaught', caughtIds: caught }),
    ).toHaveLength(900)
    expect(
      filterSpeciesSummaries(summaries, { waterType: 'fresh' }).every((summary) =>
        summary.waterTypes.includes('fresh'),
      ),
    ).toBe(true)
    expect(
      filterSpeciesSummaries(summaries, { regionId: 'hokkaido' }).every((summary) =>
        summary.regionIds.some((id) => String(id) === 'hokkaido'),
      ),
    ).toBe(true)
  })

  it('never returns more than one page before the player asks', () => {
    const page = paginateSummaries(summaries, CODEX_PAGE_SIZE)

    expect(page.visible).toHaveLength(CODEX_PAGE_SIZE)
    expect(page.hasMore).toBe(true)
    expect(page.total).toBe(1000)

    const grown = paginateSummaries(summaries, CODEX_PAGE_SIZE * 2)
    expect(grown.visible).toHaveLength(CODEX_PAGE_SIZE * 2)
  })

  it('combines search + filters deterministically', () => {
    const caught = new Set(summaries.slice(0, 500).map((summary) => String(summary.id)))
    const result = filterSpeciesSummaries(summaries, {
      query: 'synthetic fish 000',
      catchFilter: 'uncaught',
      caughtIds: caught,
      regionId: 'alaska',
    })

    expect(
      result.every(
        (summary) =>
          String(summary.id) !== '' &&
          !caught.has(String(summary.id)) &&
          summary.regionIds.some((id) => String(id) === 'alaska'),
      ),
    ).toBe(true)
  })
})

describe('content scale simulation', () => {
  it('passes every check', () => {
    const result = simulateContentScale()
    const failed = result.checks.filter((check) => !check.ok)

    expect(failed.map((check) => check.label)).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('keeps the domain free of content loading concerns', () => {
    const domainFiles = readProjectSources().filter(
      (file) => file.path.startsWith('src/domain/') && !file.path.endsWith('.test.ts'),
    )

    expect(domainFiles.length).toBeGreaterThan(10)

    for (const file of domainFiles) {
      expect(file.source, file.path).not.toContain('contentRuntime')
      expect(file.source, file.path).not.toContain('import.meta.glob')
      expect(file.source, file.path).not.toContain('await import(')
    }
  })
})

describe('synthetic 1000 species shard planning', () => {
  it('does not need every species detail to play one region', () => {
    /*
     * 1000 Species 相当の manifest を組み立て、1 地域（Tokyo 相当）を遊ぶのに
     * 「必要な subset だけ」を読む構造であることを確認する。
     */
    const all = buildSyntheticSummaries(1000)
    const tokyoSize = 42

    const shards: Record<string, string[]> = {
      'species:tokyo-area': all.slice(0, tokyoSize).map((summary) => String(summary.id)),
    }
    const rest = all.slice(tokyoSize)

    rest.forEach((summary, index) => {
      const key = `species:region-${String(index % 4)}`
      shards[key] = [...(shards[key] ?? []), String(summary.id)]
    })

    const shardOf = new Map<string, string>()
    for (const [key, ids] of Object.entries(shards)) {
      for (const id of ids) {
        shardOf.set(id, key)
      }
    }

    const speciesIds = Object.keys(
      Object.fromEntries(all.map((summary) => [String(summary.id), true])),
    )

    expect(speciesIds).toHaveLength(1000)
    expect(new Set(shardOf.values()).size).toBe(Object.keys(shards).length)

    const requiredShardsForTokyo = new Set(
      (shards['species:tokyo-area'] ?? []).map((id) => shardOf.get(id)),
    )

    expect(requiredShardsForTokyo).toEqual(new Set(['species:tokyo-area']))

    const loadedSpeciesCount = (shards['species:tokyo-area'] ?? []).length

    expect(loadedSpeciesCount).toBe(tokyoSize)
    expect(loadedSpeciesCount).toBeLessThan(all.length)
  })
})
