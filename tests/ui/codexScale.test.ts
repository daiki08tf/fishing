import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { CODEX_PAGE_SIZE } from '../../src/content/catalog/speciesSearch'
import type { PlayerStoreState } from '../../src/state/playerStore'
import { createPlayerStore } from '../../src/state/playerStore'
import type * as PlayerStoreModule from '../../src/state/playerStore'

/**
 * Phase 15 — CODEX の scale 対応（軽量カタログ + 段階表示）。
 *
 * 1000 種を一度に DOM へ出さないこと、検索 UI があること、
 * 未捕獲種の名前を漏らさないことを markup で確認する。
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

const { CodexScreen } = await import('../../src/ui/codex/CodexScreen')

const content = loadContentFromDirectory()

const render = (): string => {
  holder.state = createPlayerStore().getState()

  return renderToStaticMarkup(createElement(CodexScreen))
}

describe('codex scale foundation', () => {
  it('renders only the first page of tiles', () => {
    const html = render()

    // 1 tile = <li class="codex-tile ..."> で数える（内側の class 名と混ざらないように）。
    expect(html.split('<li class="codex-tile').length - 1).toBe(CODEX_PAGE_SIZE)
    expect(html).toContain('さらに表示')
    expect(html).toContain(
      `${String(CODEX_PAGE_SIZE)} / ${String(content.species.length)} 種を表示中`,
    )
  })

  it('offers name search and keeps uncaught names hidden', () => {
    const html = render()

    expect(html).toContain('名前で探す')
    expect(html).toContain('？？？')
    expect(html).not.toContain(content.species[0]?.japaneseName ?? '')
  })

  it('filters by region / water type from the lightweight catalog', () => {
    const html = render()

    expect(html).toContain('全地域')
    expect(html).toContain('全水域')
    expect(html).toContain('東京近郊')
  })
})
