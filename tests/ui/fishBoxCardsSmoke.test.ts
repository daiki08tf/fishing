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
 * Phase 14 — Fish Box のカード表示。
 *
 * 一覧には name / length / weight / percentile / freshness / estimated value を出し、
 * 産地・Trait・釣った日時は詳細開示（<details>）に折りたたむ。
 * <details> の中身は open が無くても静的マークアップには残る
 * （視覚的に畳まれていても、テキストとしては存在する）ので、
 * renderToStaticMarkup でそのまま存在チェックできる。
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

const { FishBoxScreen } = await import('../../src/ui/trade/FishBoxScreen')

const keptMaaji: KeptCatch = {
  catchId: asFishIndividualId('ui-fishbox-card-1'),
  speciesId: asFishSpeciesId('maaji'),
  lengthCm: 28,
  weightKg: 0.4,
  condition: 0.7,
  percentile: 70,
  traits: ['trophy'],
  caughtAt: { year: 2026, month: 5, day: 2, hour: 6, minute: 0 },
  sourceSpotId: asFishingSpotId('tokyo-urban-canal'),
  sourceRegionId: asRegionId('tokyo-area'),
}

const withFishBox = (fishBox: readonly KeptCatch[]): PlayerStoreState => {
  const base = createPlayerStore().getState()

  return {
    ...base,
    world: { ...base.world, currentRegionId: asRegionId('tokyo-area') },
    trade: { ...base.trade, fishBox },
  }
}

describe('fish box cards', () => {
  it('shows an empty state when nothing was kept', () => {
    holder.state = withFishBox([])
    const html = renderToStaticMarkup(createElement(FishBoxScreen))

    expect(html).toContain('Fish Box は空')
    expect(html).toContain('持ち帰った魚（0）')
  })

  it('shows the card facts up front and collapses source/traits/caughtAt into a details block', () => {
    holder.state = withFishBox([keptMaaji])
    const html = renderToStaticMarkup(createElement(FishBoxScreen))

    expect(html).toContain('持ち帰った魚（1）')
    expect(html).toContain('マアジ（暫定）')
    expect(html).toContain('28 cm')
    expect(html).toContain('0.400 kg')
    expect(html).toContain('上位 30%')
    expect(html).toContain('% 鮮度')
    expect(html).toContain('推定売却額: 最大')

    // 詳細（<details>）の中は閉じていてもマークアップ上は存在する。
    expect(html).toContain('詳しく見る')
    expect(html).toContain('都市運河（自宅周辺）')
    expect(html).toContain('Trophy')
    expect(html).not.toContain('open=')
  })
})
