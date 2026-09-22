import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { MapScreen } from '../../src/ui/map/MapScreen'
import {
  buildMapBoard,
  MAP_BANDS,
  MAP_BAND_LABELS,
  mappedEnvironments,
  shortSpotLabel,
} from '../../src/ui/map/spotPlacement'

/**
 * Phase 14.1 — MAP を「縦に並んだカード一覧」から「地図ボード → 詳細」へ。
 *
 * 配置は Content の environment だけから決定的に決まる（Spot ID や Content 順に依存しない）。
 * ここでは
 *   1. band 分けが Content を網羅していること
 *   2. 未発見 Hidden Spot はノードにも詳細にも出ないこと
 *   3. 地図ボードが詳細リストより前に描画されること
 *   4. ノードを選ぶと summary が出ること
 * を確認する。
 */

const content = loadContentFromDirectory()

describe('spot placement', () => {
  it('maps every runtime environment explicitly (no silent fallback)', () => {
    const used = new Set(content.spots.map((spot) => spot.environment))
    const mapped = new Set(mappedEnvironments())

    for (const environment of used) {
      expect(mapped.has(environment), `${environment} must have an explicit band`).toBe(true)
    }
  })

  it('fills the bands from the current region content', () => {
    const tokyoSpots = content.spots.filter(
      (spot) => String(spot.regionId) === 'tokyo-area' && spot.visibility !== 'hidden',
    )
    const board = buildMapBoard(tokyoSpots)

    expect(board.length).toBeGreaterThanOrEqual(3)
    expect(board.flatMap((group) => group.nodes)).toHaveLength(tokyoSpots.length)

    for (const group of board) {
      expect(MAP_BANDS).toContain(group.band)
      expect(group.label).toBe(MAP_BAND_LABELS[group.band])
    }
  })

  it('orders nodes by name so the layout does not depend on content order', () => {
    const spots = content.spots.filter(
      (spot) => String(spot.regionId) === 'tokyo-area' && spot.visibility !== 'hidden',
    )
    const forward = buildMapBoard(spots)
    const backward = buildMapBoard([...spots].reverse())

    const ids = (
      board: ReturnType<typeof buildMapBoard<{ name: string; environment: string; id: string }>>,
    ) => board.flatMap((group) => group.nodes.map((node) => node.spot.id))

    expect(ids(backward)).toEqual(ids(forward))
  })

  it('keeps node labels short', () => {
    expect(shortSpotLabel('荒川 下流')).toBe('荒川 下流')
    expect(shortSpotLabel('路地裏の護岸（要情報）')).toBe('路地裏の護岸')
    expect(shortSpotLabel('とても長い釣り場の名前です').length).toBeLessThanOrEqual(9)
  })
})

describe('map screen board', () => {
  const html = renderToStaticMarkup(createElement(MapScreen))

  it('renders the map board before the detail list', () => {
    const boardIndex = html.indexOf('釣り場マップ')
    const detailIndex = html.indexOf('釣り場の詳細')

    expect(boardIndex).toBeGreaterThan(-1)
    expect(detailIndex).toBeGreaterThan(boardIndex)
    expect(html).toContain('map-board__band')
    expect(html).toContain('map-node')
  })

  it('shows one node per visible spot and none for undiscovered hidden spots', () => {
    const tokyoPublic = content.spots.filter(
      (spot) => String(spot.regionId) === 'tokyo-area' && spot.visibility !== 'hidden',
    )
    const tokyoHidden = content.spots.filter(
      (spot) => String(spot.regionId) === 'tokyo-area' && spot.visibility === 'hidden',
    )

    expect(tokyoHidden.length).toBeGreaterThan(0)

    for (const spot of tokyoPublic) {
      expect(html).toContain(`aria-label="${spot.name}"`)
    }

    // 未発見の Hidden Spot は存在を出さない（名前もノードも出さない）。
    for (const spot of tokyoHidden) {
      expect(html).not.toContain(spot.name)
    }
    // ノードとしての Hidden Spot（★）は 1 つも出ない（凡例の ★ だけが残る）。
    expect(html).not.toContain('map-node--rumor')
  })

  it('keeps the detail list (travel options and blocked reasons) as before', () => {
    expect(html).toContain('移動手段を見る')
    expect(html).toContain('釣況:')
    expect(html).toContain('この釣り場の知識')
  })

  it('shows a spot summary when a node is selected', () => {
    const selected = renderToStaticMarkup(
      createElement(MapScreen, { initialSelectedSpotId: 'arakawa-lower' }),
    )

    expect(selected).toContain('panel--node-summary')
    expect(selected).toContain('荒川 下流')
    expect(selected).toContain('map-node--selected')
  })
})
