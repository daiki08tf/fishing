import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CodexScreen } from '../../src/ui/codex/CodexScreen'
import { ContactsScreen } from '../../src/ui/contacts/ContactsScreen'
import { ExpeditionScreen } from '../../src/ui/expedition/ExpeditionScreen'
import { FishingScreen } from '../../src/ui/fishing/FishingScreen'
import { HomeScreen } from '../../src/ui/home/HomeScreen'
import { MapScreen } from '../../src/ui/map/MapScreen'
import { MenuScreen } from '../../src/ui/menu/MenuScreen'
import { ProgressionScreen } from '../../src/ui/progression/ProgressionScreen'
import { ShopScreen } from '../../src/ui/shop/ShopScreen'
import { SpotScreen } from '../../src/ui/spot/SpotScreen'
import { TackleScreen } from '../../src/ui/tackle/TackleScreen'
import { FishBoxScreen } from '../../src/ui/trade/FishBoxScreen'
import { TradeScreen } from '../../src/ui/trade/TradeScreen'

/**
 * Phase 14 — 全画面のレンダリング・スモークテスト。
 *
 * 375 / 390 / 430px のような実ビューポート検証はブラウザが要る（Playwright で別途）。
 * ここでは新規セーブの初期状態で、すべての画面が例外を投げずに `.panel` を
 * 少なくとも 1 つ描画できることだけを保証する（回帰の早期検知）。
 */

const screens: ReadonlyArray<readonly [string, () => ReactElement]> = [
  ['home', () => createElement(HomeScreen)],
  ['map', () => createElement(MapScreen)],
  ['spot', () => createElement(SpotScreen)],
  ['fishing', () => createElement(FishingScreen, { onExit: () => undefined })],
  ['progression', () => createElement(ProgressionScreen)],
  ['shop', () => createElement(ShopScreen)],
  ['tackle', () => createElement(TackleScreen)],
  ['expedition', () => createElement(ExpeditionScreen)],
  ['fishbox', () => createElement(FishBoxScreen)],
  ['trade', () => createElement(TradeScreen)],
  ['contacts', () => createElement(ContactsScreen)],
  ['codex', () => createElement(CodexScreen)],
  ['menu', () => createElement(MenuScreen)],
]

describe('every screen renders without throwing', () => {
  for (const [name, make] of screens) {
    it(`${name} renders at least one panel`, () => {
      const html = renderToStaticMarkup(make())

      expect(html.length).toBeGreaterThan(0)
      expect(html).toContain('panel')
    })
  }
})
