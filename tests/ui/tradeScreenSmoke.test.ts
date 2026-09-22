import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerStoreState } from '../../src/state/playerStore'
import { createPlayerStore } from '../../src/state/playerStore'
import type * as PlayerStoreModule from '../../src/state/playerStore'
import {
  asFishIndividualId,
  asFishSpeciesId,
  asFishingSpotId,
  asRegionId,
} from '../../src/domain/ids'
import type { KeptCatch } from '../../src/domain/trade'

/**
 * Phase 13.1 — TRADE 画面は **今いる地域の買取先だけ** を出す。
 *
 * サーバー描画では Store の初期状態が使われるため、ここでは Store を差し替えて
 * 「地域ごとに何が出るか」だけを見る（判定そのものは Domain のテストが担保する）。
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

const { TradeScreen } = await import('../../src/ui/trade/TradeScreen')
const { FishBoxScreen } = await import('../../src/ui/trade/FishBoxScreen')

const keptMaaji: KeptCatch = {
  catchId: asFishIndividualId('ui-catch-1'),
  speciesId: asFishSpeciesId('maaji'),
  lengthCm: 28,
  weightKg: 0.4,
  condition: 0.7,
  percentile: 70,
  traits: [],
  caughtAt: { year: 2026, month: 5, day: 2, hour: 6, minute: 0 },
  sourceSpotId: asFishingSpotId('tokyo-urban-canal'),
  sourceRegionId: asRegionId('tokyo-area'),
}

const withRegion = (regionId: string, fishBox: readonly KeptCatch[] = []): PlayerStoreState => {
  const base = createPlayerStore().getState()

  return {
    ...base,
    world: { ...base.world, currentRegionId: asRegionId(regionId) },
    trade: { ...base.trade, fishBox },
  }
}

const render = (
  element: Parameters<typeof renderToStaticMarkup>[0],
  fishBox: readonly KeptCatch[] = [],
): string => {
  holder.state = withRegion(currentRegionId, fishBox)
  return renderToStaticMarkup(element)
}

let currentRegionId = 'tokyo-area'

describe('trade screen buyer filtering', () => {
  it('shows the buyers of the current region (Tokyo)', () => {
    currentRegionId = 'tokyo-area'
    const html = render(createElement(TradeScreen))

    expect(html).toContain('Local Izakaya')
    expect(html).toContain('Fish Wholesaler')
    expect(html).toContain('Market Broker')
    expect(html).not.toContain('この地域に買取先が無い')
  })

  it('hides every other-region buyer away from Tokyo (Hokkaido)', () => {
    currentRegionId = 'hokkaido'
    const html = render(createElement(TradeScreen))

    expect(html).not.toContain('Local Izakaya')
    expect(html).not.toContain('Fish Wholesaler')
    expect(html).not.toContain('Market Broker')
    // 現在地域に Buyer がいない場合は自然な空状態を出す（行き止まりに見せない）。
    expect(html).toContain('この地域に買取先が無い')
  })

  it('does not offer a best price from another region in the fish box', () => {
    currentRegionId = 'hokkaido'
    const html = render(createElement(FishBoxScreen), [keptMaaji])

    expect(html).toContain('今いる地域に買取先が無い')
  })

  it('does offer a best price while in the buyer region', () => {
    currentRegionId = 'tokyo-area'
    const html = render(createElement(FishBoxScreen), [keptMaaji])

    expect(html).toContain('推定売却額: 最大')
    expect(html).not.toContain('今いる地域に買取先が無い')
  })
})
