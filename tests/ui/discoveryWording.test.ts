import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type { PlayerStoreState } from '../../src/state/playerStore'
import { createPlayerStore } from '../../src/state/playerStore'
import type * as PlayerStoreModule from '../../src/state/playerStore'

/**
 * Phase 13.1 — Discovery の表示。
 *
 * - 未発見の Hidden Spot を件数・一覧に出さない（総数の漏洩を防ぐ）
 * - Contact から知っただけの Spot を「訪問済み」と呼ばない
 */

const holder = vi.hoisted(() => ({ state: null as unknown }))

vi.mock('../../src/state/playerStore', async (importOriginal) => {
  const actual = await importOriginal<typeof PlayerStoreModule>()

  return {
    ...actual,
    usePlayerStore: <TSelected>(selector: (state: PlayerStoreState) => TSelected): TSelected =>
      selector(holder.state as PlayerStoreState),
  }
})

const { HomeScreen } = await import('../../src/ui/home/HomeScreen')
const { MapScreen } = await import('../../src/ui/map/MapScreen')

const content = loadContentFromDirectory()
const tokyoSpots = content.spots.filter((spot) => String(spot.regionId) === 'tokyo-area')
const tokyoPublic = tokyoSpots.filter((spot) => spot.visibility !== 'hidden')
const tokyoHidden = tokyoSpots.filter((spot) => spot.visibility === 'hidden')

const stateWith = (discoveredSpotIds: readonly string[]): PlayerStoreState => {
  const base = createPlayerStore().getState()

  return {
    ...base,
    world: {
      ...base.world,
      discoveredSpotIds:
        discoveredSpotIds as unknown as PlayerStoreState['world']['discoveredSpotIds'],
    },
  }
}

describe('hidden spot count and wording', () => {
  it('has hidden spots in the current region that must not be leaked', () => {
    expect(tokyoHidden.length).toBeGreaterThan(0)
  })

  it('counts only visible spots on HOME (undiscovered hidden spots stay hidden)', () => {
    holder.state = stateWith([])
    const html = renderToStaticMarkup(createElement(HomeScreen))

    // 分母は「Map に出る Spot」だけ（未発見 Hidden Spot を含めない）。
    expect(html).toContain(`/ ${String(tokyoPublic.length)}（東京近郊）`)
    expect(tokyoPublic.length).toBeLessThan(tokyoSpots.length)
    expect(html).toContain('<dd>0 箇所</dd>')

    for (const spot of tokyoHidden) {
      expect(html).not.toContain(spot.name)
    }
  })

  it('adds a discovered hidden spot to the HOME counts', () => {
    const discovered = tokyoHidden[0]

    if (discovered === undefined) {
      throw new Error('no hidden spot')
    }

    holder.state = stateWith([String(discovered.id)])
    const html = renderToStaticMarkup(createElement(HomeScreen))

    expect(html).toContain('>1 箇所<')
    expect(html).toContain(`/ ${String(tokyoPublic.length + 1)}（東京近郊）`)
  })

  it('never says 訪問済み for a spot that was only discovered from a contact', () => {
    const discovered = tokyoHidden[0]

    if (discovered === undefined) {
      throw new Error('no hidden spot')
    }

    holder.state = stateWith([String(discovered.id)])
    const html = renderToStaticMarkup(createElement(MapScreen))

    expect(html).toContain(discovered.name)
    expect(html).toContain('発見済み')
    expect(html).not.toContain('訪問済み')
  })

  it('keeps an undiscovered hidden spot off the map entirely', () => {
    holder.state = stateWith([])
    const html = renderToStaticMarkup(createElement(MapScreen))

    for (const spot of tokyoHidden) {
      expect(html).not.toContain(spot.name)
    }
  })
})
