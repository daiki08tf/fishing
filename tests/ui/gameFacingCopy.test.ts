import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import {
  buyerPreferenceChips,
  buyerRoleLabel,
  describeBuyerRole,
} from '../../src/ui/trade/buyerPresentation'
import { ContactsScreen } from '../../src/ui/contacts/ContactsScreen'
import { FishBoxScreen } from '../../src/ui/trade/FishBoxScreen'
import { HomeScreen } from '../../src/ui/home/HomeScreen'
import { MapScreen } from '../../src/ui/map/MapScreen'
import { TradeScreen } from '../../src/ui/trade/TradeScreen'

/**
 * Phase 14.1 — プレイヤー向けの文章を短く、世界観優先にする。
 *
 * - Content の長文 description（PROVISIONAL の注記を含む）は画面に出さない。
 * - 買取先の紹介は BuyerDefinition の数値と preferences から組み立てる（魚種 ID 分岐なし）。
 * - 「PROVISIONAL」「gameplay tuning」など開発向けの語をユーザー画面に出さない。
 */

const content = loadContentFromDirectory()

describe('buyer presentation', () => {
  it('describes every runtime buyer in 1-2 short clauses', () => {
    expect(content.buyers.length).toBeGreaterThan(0)

    for (const buyer of content.buyers) {
      const role = describeBuyerRole(buyer)

      expect(role.length).toBeGreaterThan(0)
      expect(role.length, `${String(buyer.id)}: ${role}`).toBeLessThanOrEqual(26)
      expect(role.split('・').length).toBeLessThanOrEqual(2)
      expect(role).not.toContain('PROVISIONAL')
      expect(role).not.toContain('tuning')
    }
  })

  it('separates the three buyer types by role words, not by species', () => {
    const roles = content.buyers.map((buyer) => describeBuyerRole(buyer))

    // 同じ文章が並ぶと「選ぶ意味」が見えなくなる。
    expect(new Set(roles).size).toBe(roles.length)
  })

  it('labels buyer types in Japanese for the player', () => {
    for (const buyer of content.buyers) {
      expect(['居酒屋', '卸', '市場']).toContain(buyerRoleLabel(buyer))
    }
  })

  it('shows preference chips from the content trade tags', () => {
    for (const buyer of content.buyers) {
      const chips = buyerPreferenceChips(buyer)

      expect(chips.length).toBeGreaterThan(0)
      for (const chip of chips) {
        expect(chip.length).toBeLessThanOrEqual(4)
      }
    }
  })
})

describe('user facing screens', () => {
  const screens: ReadonlyArray<readonly [string, () => string]> = [
    ['home', () => renderToStaticMarkup(createElement(HomeScreen))],
    ['map', () => renderToStaticMarkup(createElement(MapScreen))],
    ['fishbox', () => renderToStaticMarkup(createElement(FishBoxScreen))],
    ['trade', () => renderToStaticMarkup(createElement(TradeScreen))],
    ['contacts', () => renderToStaticMarkup(createElement(ContactsScreen))],
  ]

  for (const [name, render] of screens) {
    it(`${name} does not leak development wording`, () => {
      const html = render()

      expect(html).not.toContain('PROVISIONAL')
      expect(html).not.toContain('gameplay tuning')
      expect(html).not.toContain('pricingProfile')
      expect(html).not.toContain('tradeTags')
    })
  }

  it('keeps the game-facing copy short on HOME', () => {
    const html = renderToStaticMarkup(createElement(HomeScreen))

    // 家計の内訳は details にたたむ（上部は日時・天気・CTA・噂を優先する）。
    expect(html).toContain('くわしい家計')
    expect(html).not.toContain('生活費 ¥180,000）')
  })

  it('keeps buyer role text on TRADE and CONTACTS', () => {
    const trade = renderToStaticMarkup(createElement(TradeScreen))
    const contacts = renderToStaticMarkup(createElement(ContactsScreen))

    for (const buyer of content.buyers) {
      expect(trade).toContain(buyerRoleLabel(buyer))
      expect(contacts).toContain(buyerRoleLabel(buyer))
    }

    // 長文 description の本文は出さない。
    for (const buyer of content.buyers) {
      expect(trade).not.toContain(buyer.description)
      expect(contacts).not.toContain(buyer.description)
    }
  })
})
