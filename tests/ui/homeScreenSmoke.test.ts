import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HomeScreen } from '../../src/ui/home/HomeScreen'

// Phase 9: HOME で今日の条件（天候 / 潮 / 水温 / 流れ / 釣況）が見える。
// サーバー描画なので新規ゲームの初期状態（東京近郊 / 5月2日 06:00）を見る。

const html = renderToStaticMarkup(createElement(HomeScreen))

describe('home screen conditions', () => {
  it('shows the current environment summary', () => {
    expect(html).toContain('今日の条件')
    expect(html).toContain('水温')
    expect(html).toContain('流れ')
    expect(html).toContain('釣況:')
  })

  it('keeps the domestic home flow reachable', () => {
    expect(html).toContain('釣りに行く（釣り場を選ぶ）')
    expect(html).toContain('遠征・旅行（EXPEDITION）')
  })
})
