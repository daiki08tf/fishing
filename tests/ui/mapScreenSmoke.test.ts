import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MapScreen } from '../../src/ui/map/MapScreen'

/**
 * Map 画面のスモークテスト（Phase 7A.1）。
 *
 * サーバー描画では新規ゲームの初期状態が使われる。
 * ここで確認するのは「移動手段の候補と費用が UI に出ていること」
 * 「既定が最も安い候補であること」である。クリック後の挙動は Store のテストで担保する。
 */

const html = renderToStaticMarkup(createElement(MapScreen))

describe('map screen travel options', () => {
  it('lists every usable transport for a spot', () => {
    // 荒川下流は電車（¥840）とバス（¥1,040）の 2 候補。
    expect(html).toContain('● 電車')
    expect(html).toContain('○ バス')
    expect(html).toContain('¥840（往復）')
    expect(html).toContain('¥1,040（往復）')
  })

  it('selects the cheapest option by default', () => {
    expect(html).toContain('電車 で行く')
  })

  it('shows the cost breakdown from cost components', () => {
    expect(html).toContain('運賃 ¥420（片道）')
    expect(html).toContain('運賃 ¥520（片道）')
  })

  it('shows the rental cost for a rental transport', () => {
    expect(html).toContain('レンタル料 ¥28,000（1釣行）')
    expect(html).toContain('レンタル料 ¥9,000（1釣行）')
    expect(html).toContain('レンタカー で行く')
  })

  it('explains inaccessible spots with the transport reason', () => {
    // 上流の湖は車両の所有が必要（capability 不足ではない）。
    expect(html).toContain('必要: この釣り場へ行ける移動手段の所有（Shop で購入）')
    expect(html).not.toContain('必要: 道路からのアクセス')
  })
})
