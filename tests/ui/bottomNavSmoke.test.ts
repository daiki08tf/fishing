import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AppScreen, AppState } from '../../src/state/appStore'
import type * as AppStoreModule from '../../src/state/appStore'

/**
 * Phase 14 — Bottom Nav（スマホ下部固定ナビゲーション）。
 *
 * 5 項目（ホーム/マップ/魚かご/図鑑/メニュー）のうち、今いる画面に対応する
 * タブだけが active になること、Fishing 中は隠れることを確認する。
 * クリック後の遷移そのものは appStore のテストが担保する。
 *
 * サーバー描画（renderToStaticMarkup）は zustand の getServerSnapshot
 * （= 作成時点の初期状態）しか見ないため、他の Screen smoke test と同じく
 * Store を差し替えて「今の画面が何か」だけを固定する。
 */

const holder = vi.hoisted(() => ({ activeScreen: 'home' as AppScreen }))

vi.mock('../../src/state/appStore', async (importOriginal) => {
  const actual = await importOriginal<typeof AppStoreModule>()

  return {
    ...actual,
    useAppStore: <TSelected>(selector: (state: AppState) => TSelected): TSelected =>
      selector({ ...actual.useAppStore.getState(), activeScreen: holder.activeScreen }),
  }
})

const { BottomNav } = await import('../../src/ui/nav/BottomNav')

const renderOn = (screen: AppScreen): string => {
  holder.activeScreen = screen
  return renderToStaticMarkup(createElement(BottomNav))
}

/** ラベルを含む <button>…</button> 断片を取り出す。 */
const buttonFor = (html: string, label: string): string => {
  const buttons = html
    .split('<button')
    .slice(1)
    .map((chunk) => `<button${chunk}`)
  const found = buttons.find((button) => button.includes(`aria-label="${label}"`))

  if (found === undefined) {
    throw new Error(`no button for label ${label}`)
  }

  return found
}

describe('bottom nav', () => {
  it('shows all five labels', () => {
    const html = renderOn('home')

    for (const label of ['ホーム', 'マップ', '魚かご', '図鑑', 'メニュー']) {
      expect(html).toContain(label)
    }
  })

  it('marks only the Home tab active on home', () => {
    const html = renderOn('home')

    expect(html.match(/aria-current="page"/g)?.length).toBe(1)
    expect(buttonFor(html, 'ホーム')).toContain('aria-current="page"')
  })

  it('marks the Map tab active while on the spot screen too', () => {
    const html = renderOn('spot')

    expect(buttonFor(html, 'マップ')).toContain('aria-current="page"')
  })

  it('marks the Fish Box tab active while on trade (nested under Fish Box)', () => {
    const html = renderOn('trade')

    expect(buttonFor(html, '魚かご')).toContain('aria-current="page"')
  })

  it('marks the Menu tab active for contacts (reached via Menu)', () => {
    const html = renderOn('contacts')

    expect(buttonFor(html, 'メニュー')).toContain('aria-current="page"')
  })

  it('hides itself entirely during fishing', () => {
    const html = renderOn('fishing')

    expect(html).toBe('')
  })
})
