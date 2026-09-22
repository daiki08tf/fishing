import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { filterSpeciesSummaries } from '../../src/content/catalog/speciesSearch'
import {
  bootPackKeys,
  GLOBAL_PACK_KEYS,
  regionPackKey,
} from '../../src/content/runtime/contentRuntime'
import { projectRoot } from '../architecture/testProjectFiles'

/**
 * Phase 15.1 — 「本当に必要な分だけ読む」ことの回帰ガード。
 *
 * - 起動 critical path は catalog + world + 今いる地域（+ その地域の Species shard）
 * - EXPEDITION を開いただけでは全地域を読まない（目的地を選んだ/出発する時だけ）
 * - HOME は tackle の完了を待たない
 * - Codex の名前検索は捕獲済みだけを対象にする（未捕獲の存在を漏らさない）
 */

const root = projectRoot()
const content = loadContentFromDirectory()

const readSource = (path: string): string => readFileSync(resolve(root, path), 'utf8')

describe('boot critical path', () => {
  it('requires only catalog + world + current region + its species shard', () => {
    expect(bootPackKeys('tokyo-area')).toEqual([
      GLOBAL_PACK_KEYS.world,
      regionPackKey('tokyo-area'),
      'species:tokyo-area',
    ])
  })

  it('does not wait for the tackle catalog in AppShell', () => {
    const source = readSource('src/ui/AppShell.tsx')

    expect(source).toContain('bootPackKeys(currentRegionId)')
    // tackle は required ではなく background preload だけ。
    expect(source).toContain('contentRuntime.ensureTackle()')
    expect(source).not.toContain('GLOBAL_PACK_KEYS.tackle,\n    ]')
  })
})

describe('expedition loading', () => {
  it('does not preload every region when the screen mounts', () => {
    const source = readSource('src/ui/expedition/ExpeditionScreen.tsx')

    // mount 時に全 region pack を ensure する loop を復活させない。
    expect(source).not.toContain('for (const pack of contentRuntime.index.packs)')
    // 目的地のカード操作 / 出発時に、その地域だけを先読みする。
    expect(source).toContain('const preloadRegion = (regionId: string)')
    expect(source).toContain('onFocusCapture')
  })

  it('matches the region pack shape used by the runtime', () => {
    expect(regionPackKey(String(content.regions[0]?.id))).toContain('region:')
  })
})

describe('codex hidden-information semantics', () => {
  const summaries = contentRuntimeSummaries()

  function contentRuntimeSummaries() {
    return JSON.parse(
      readFileSync(resolve(root, 'src/content/generated/content-index.json'), 'utf8'),
    ).species as Parameters<typeof filterSpeciesSummaries>[0]
  }

  it('does not reveal uncaught species through exact-name search', () => {
    const target = summaries.find((summary) => summary.japaneseName.length > 0)

    if (target === undefined) {
      throw new Error('no species summary')
    }

    const caughtIds = new Set<string>()

    // 未捕獲: 名前で検索しても 1 件も返らない（存在を示唆しない）。
    expect(
      filterSpeciesSummaries(summaries, {
        query: target.japaneseName,
        catchFilter: 'all',
        caughtIds,
        searchScope: 'caught',
      }),
    ).toEqual([])

    // 捕獲済みなら通常どおり引ける。
    const caught = new Set<string>([String(target.id)])
    const found = filterSpeciesSummaries(summaries, {
      query: target.japaneseName,
      caughtIds: caught,
      searchScope: 'caught',
    })

    expect(found.map((summary) => String(summary.id))).toEqual([String(target.id)])
  })

  it('keeps region / water filters unchanged for uncaught species', () => {
    const byRegion = filterSpeciesSummaries(summaries, {
      regionId: 'tokyo-area',
      catchFilter: 'uncaught',
      caughtIds: new Set<string>(),
      searchScope: 'caught',
    })

    expect(byRegion.length).toBeGreaterThan(0)
    expect(
      filterSpeciesSummaries(summaries, {
        regionId: 'tokyo-area',
        searchScope: 'caught',
        caughtIds: new Set<string>(),
      }).length,
    ).toBe(byRegion.length)
  })
})
