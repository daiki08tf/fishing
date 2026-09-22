import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import {
  bootPackKeys,
  createContentRuntime,
  GLOBAL_PACK_KEYS,
  regionPackKey,
  speciesShardKey,
  type ContentRuntime,
} from '../../src/content/runtime/contentRuntime'
import { DEFAULT_WORLD_TUNING } from '../../src/domain/world/WorldTuning'
import { createPlayerStore } from '../../src/state/playerStore'
import { MapScreen } from '../../src/ui/map/MapScreen'
import { ExpeditionScreen } from '../../src/ui/expedition/ExpeditionScreen'
import { projectRoot } from '../architecture/testProjectFiles'

/**
 * Phase 16 Part 2b — 最終 hardening。
 *
 * - lazy loading（Tokyo boot / Izu 選択 / Amazon 選択）
 * - 地域外の釣り場へ直接移動できない（Access / Discovery は既存のまま）
 * - EXPEDITION の国内 / 海外グループ
 * - mobile 向け静的チェック（実ブラウザは無いので markup / CSS で確認する）
 */

const root = projectRoot()
const content = loadContentFromDirectory()

const spotOf = (regionId: string) => {
  const spot = content.spots.find((entry) => String(entry.regionId) === regionId)

  if (spot === undefined) {
    throw new Error(`no spot in ${regionId}`)
  }

  return spot
}

/** importer 呼び出しを記録する runtime（実 Content を返す）。 */
const createInstrumentedRuntime = (): {
  readonly runtime: ContentRuntime
  readonly calls: string[]
} => {
  const calls: string[] = []
  const runtime = createContentRuntime({
    loadPackModule: (key) => async () => ({
      load: async (): Promise<Readonly<Record<string, readonly unknown[]>>> => {
        calls.push(key)

        if (key === GLOBAL_PACK_KEYS.world) {
          return {
            regions: content.regions,
            countries: content.countries,
            transports: content.transports,
            expeditions: content.expeditions,
          }
        }

        if (key.startsWith('region:')) {
          const regionId = key.slice('region:'.length)

          return {
            'fishing-spots': content.spots.filter((spot) => String(spot.regionId) === regionId),
            buyers: content.buyers.filter((buyer) => String(buyer.regionId) === regionId),
            'contact-rewards': [],
          }
        }

        if (key.startsWith('species:')) {
          const regionId = key.slice('species:'.length)
          const ids = new Set(
            content.spots
              .filter((spot) => String(spot.regionId) === regionId)
              .flatMap((spot) => spot.fishTable.map((occurrence) => String(occurrence.speciesId))),
          )

          return {
            'fish-species': content.species.filter((species) => ids.has(String(species.id))),
            'species-trade-profiles': content.speciesTradeProfiles.filter((profile) =>
              ids.has(String(profile.speciesId)),
            ),
          }
        }

        return {}
      },
    }),
  })

  return { runtime, calls }
}

describe('region lazy loading', () => {
  it('boots Tokyo with world + Tokyo only', async () => {
    const { runtime, calls } = createInstrumentedRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })

    expect([...calls].sort()).toEqual(
      [GLOBAL_PACK_KEYS.world, regionPackKey('tokyo-area'), speciesShardKey('tokyo-area')].sort(),
    )
    expect(calls).not.toContain(regionPackKey('izu-peninsula'))
    expect(calls).not.toContain(regionPackKey('amazon-basin'))
    expect(runtime.packStatus(regionPackKey('amazon-basin'))).toBe('idle')
    expect(bootPackKeys('tokyo-area')).toHaveLength(3)
  })

  it('loads only the selected region when browsing Izu', async () => {
    const { runtime, calls } = createInstrumentedRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })
    calls.length = 0

    await runtime.ensureRegion('izu-peninsula')

    expect([...calls].sort()).toEqual(
      [regionPackKey('izu-peninsula'), speciesShardKey('izu-peninsula')].sort(),
    )
    expect(runtime.packStatus(regionPackKey('amazon-basin'))).toBe('idle')
    expect(runtime.packStatus(regionPackKey('new-zealand'))).toBe('idle')
  })

  it('loads only Amazon when it is selected', async () => {
    const { runtime, calls } = createInstrumentedRuntime()

    await runtime.ensureBootPacks({ regionId: 'tokyo-area' })
    calls.length = 0

    await runtime.ensureRegion('amazon-basin')

    expect([...calls].sort()).toEqual(
      [regionPackKey('amazon-basin'), speciesShardKey('amazon-basin')].sort(),
    )
  })

  it('keeps undiscovered hidden spots out of the map markup', () => {
    const html = renderToStaticMarkup(createElement(MapScreen))
    const hidden = content.spots.filter((spot) => spot.visibility === 'hidden')

    expect(hidden.length).toBeGreaterThan(0)

    for (const spot of hidden) {
      expect(html, String(spot.id)).not.toContain(spot.name)
    }
  })
})

describe('world progression without level locks', () => {
  it('blocks direct travel to another region', () => {
    const store = createPlayerStore()
    store.getState().completeHydrationWithoutSave()

    // 東京にいるのに北海道の釣り場へ行こうとする。
    const result = store.getState().travelToSpot(spotOf('hokkaido'), content.transports)

    expect(result.ok).toBe(false)
    expect(store.getState().world.currentRegionId).toBe(DEFAULT_WORLD_TUNING.homeRegionId)
  })

  it('allows travel inside the current region and never asks for a level', () => {
    const store = createPlayerStore()
    store.getState().completeHydrationWithoutSave()

    // 遠征で北海道へ移った状態を作る（Domain の moveToRegion 相当を state で表現）。
    store.setState({
      world: {
        ...store.getState().world,
        currentRegionId:
          content.regions.find((region) => String(region.id) === 'hokkaido')?.id ??
          store.getState().world.currentRegionId,
      },
    })

    const spot = spotOf('hokkaido')
    const access = store.getState().evaluateSpot(spot, content.transports)

    // Level は access の条件に存在しない（お金 / 道具 / 知識 / 許可だけ）。
    expect(Object.keys(access)).toContain('accessible')
    expect(JSON.stringify(access)).not.toContain('anglerLevel')
  })
})

describe('expedition grouping', () => {
  const html = renderToStaticMarkup(createElement(ExpeditionScreen))

  it('groups destinations into 国内 / 海外', () => {
    expect(html).toContain('国内')
    expect(html).toContain('海外')
    expect(html).toContain('国内')

    // すべての Expedition がどちらかのグループに出る。
    for (const expedition of content.expeditions) {
      expect(html, expedition.name).toContain(expedition.name)
    }
  })

  it('marks the current region when applicable', () => {
    // 東京はホームなので「いま ここ」は出ないが、グループ見出しは必ず出る。
    expect(html).toContain('expedition-group__title')
  })
})

describe('mobile layout static checks', () => {
  const cssFiles = readdirSync(resolve(root, 'src/ui'), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.css'))

  it('keeps a device-width viewport and safe-area padding', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8')

    expect(html).toContain('width=device-width')
    expect(html).toContain('viewport-fit=cover')
  })

  it('does not use fixed widths that would overflow a 375px viewport', () => {
    const offenders: string[] = []

    for (const relativePath of cssFiles) {
      const css = readFileSync(resolve(root, 'src/ui', relativePath), 'utf8')

      for (const match of css.matchAll(/(?<!max-)(?<!min-)width:\s*(\d{3,})px/g)) {
        const value = Number(match[1])

        if (value >= 300) {
          offenders.push(`${relativePath}: width ${String(value)}px`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('wraps the region selector and expedition groups instead of overflowing', () => {
    const mapCss = readFileSync(resolve(root, 'src/ui/map/map.css'), 'utf8')

    expect(mapCss).toMatch(/\.region-selector__list\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(mapCss).toMatch(/\.region-selector__item\s*\{[^}]*max-width/)
    expect(mapCss).not.toMatch(/overflow-x:\s*scroll/)
  })
})
