import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExpeditionScreen } from '../../src/ui/expedition/ExpeditionScreen'

// EXPEDITION 画面のスモークテスト（Phase 8）。
// 新規ゲームの初期状態で、行き先・費用・宿泊・出発可否が描画されることを見る。
// クリック後の挙動は Store のテスト（expeditionFlow）で確認する。

const html = renderToStaticMarkup(createElement(ExpeditionScreen))

describe('expedition screen', () => {
  it('lists the destinations with country and region', () => {
    expect(html).toContain('EXPEDITION')
    expect(html).toContain('アラスカ遠征')
    expect(html).toContain('北海道遠征')
    expect(html).toContain('アメリカ合衆国 / アラスカ')
    expect(html).toContain('日本 / 北海道')
  })

  it('shows the cost breakdown, the lodging options and the total', () => {
    expect(html).toContain('国際線 東京→アンカレジ（往復）')
    expect(html).toContain('Budget Lodge')
    expect(html).toContain('Fishing Lodge')
    expect(html).toContain('Alaska Fishing Permit（暫定）')
    expect(html).toContain('総額 ¥357,000')
  })

  it('shows why the trip cannot start without the money', () => {
    expect(html).toContain('資金が足りない')
  })
})
