import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TackleScreen } from '../../src/ui/tackle/TackleScreen'
import { ShopScreen } from '../../src/ui/shop/ShopScreen'

/**
 * 画面が**描画できること**だけを確認する最小のスモークテスト。
 *
 * クリック操作や見た目は対象外（Phase 6 の主眼は Domain）。
 * ここで見たいのは「Content の読み込み → Store → 画面」が繋がっていること。
 *
 * 注: サーバー描画では Store の**初期状態**が使われる（zustand の
 * getServerSnapshot）。したがってここで確認できるのは
 * 「新規ゲームの初期状態（Starter tackle）で画面が壊れないこと」である。
 * hydration 後の表示は Store / Domain のテストで担保する。
 */

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(element)

describe('tackle screen', () => {
  it('renders the starter loadout', () => {
    const html = render(createElement(TackleScreen))

    expect(html).toContain('CURRENT LOADOUT')
    expect(html).toContain('ロッド')
    expect(html).toContain('スターターロッド')
    expect(html).toContain('釣法')
    expect(html).toContain('ルアー')
  })

  it('offers every gear slot for the starter tackle', () => {
    const html = render(createElement(TackleScreen))

    for (const label of ['リール', 'ライン', 'リーダー', 'フック', '仕掛け（ルアー / 餌）']) {
      expect(html).toContain(label)
    }
  })

  it('lists the shipped gear in the shop with brands', () => {
    const html = render(createElement(ShopScreen))

    expect(html).toContain('SHOP')
    expect(html).toContain('フィネスロッド')
    expect(html).toContain('Shimara')
    expect(html).toContain('購入する')
    expect(html).toContain('移動手段')
    // Phase 6.5: カテゴリ / ブランドの絞り込み。
    expect(html).toContain('すべて')
    expect(html).toContain('ブランド')
    expect(html).toContain('点を表示中')
  })
})
