import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContactsScreen } from '../../src/ui/contacts/ContactsScreen'
import { isContactKnown } from '../../src/domain/trade'
import { contentRuntime } from '../../src/content/runtime/contentRuntime'
import { asContactRewardId } from '../../src/domain/ids'

/**
 * Phase 17C — CONTACTS 画面は汎用 Contact（Captain など）も表示する。
 * ただし `isContactKnown` を満たすまでは出さない（Discovery != Access と同じ、
 * 「知らない人物は見せない」というポリシー）。
 *
 * 状態を変えた再描画は `renderToStaticMarkup` が SSR snapshot（ストア作成時の
 * 初期状態）を使うため検証できない。ここでは (1) 初期状態での非表示を実描画で、
 * (2) 実 Content 上での unlock 判定を `isContactKnown` 本体で確認する。
 */
describe('ContactsScreen generic contacts (Phase 17C)', () => {
  it('hides an un-introduced captain contact from a fresh save', () => {
    const html = renderToStaticMarkup(createElement(ContactsScreen))

    expect(html).not.toContain('タロウ船長')
  })

  it('wires the fish-wholesaler → captain-taro introduction chain through real content', () => {
    const content = contentRuntime.getState().content

    if (content === null) {
      throw new Error('content runtime not hydrated')
    }

    const captain = content.contacts.find((entry) => String(entry.id) === 'captain-taro')

    if (captain === undefined) {
      throw new Error('captain-taro contact is missing from content')
    }

    expect(isContactKnown(captain, content.contactRewards, [])).toBe(false)
    expect(
      isContactKnown(captain, content.contactRewards, [
        asContactRewardId('fish-wholesaler-introduces-captain-taro'),
      ]),
    ).toBe(true)
  })
})
