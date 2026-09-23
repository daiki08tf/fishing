import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { DEFAULT_ECONOMY_TUNING } from '../../src/domain/economy'
import { MapScreen } from '../../src/ui/map/MapScreen'

/**
 * Phase 16 Part 2 — depth / progression / world UX の契約。
 *
 * - content scale（Species / Spot / Buyer）
 * - Region の深さ（Spot 数 / environment / hidden）
 * - Trust → Rumor → Secret Spot の 3 段階チェーン（閾値は Region ごとに違う）
 * - Divevery ≠ Access（Hidden Spot は access 条件を持ったまま）
 * - Expedition の cost curve
 * - Region selector UI（横一列のタブに戻らない）
 */

const content = loadContentFromDirectory()

const PHASE_16_REGIONS = [
  'izu-peninsula',
  'tohoku-pacific',
  'hokuriku-japan-sea',
  'okinawa',
  'norway-fjords',
  'new-zealand',
  'baja-california',
  'thailand',
  'amazon-basin',
] as const

const playableRegions = content.regions.filter((region) => region.stage === 'playable')

const expeditionTotal = (regionId: string): number => {
  const expedition = content.expeditions.find((entry) => String(entry.regionId) === regionId)

  if (expedition === undefined) {
    throw new Error(`no expedition for ${regionId}`)
  }

  const lodging = expedition.lodgings[Math.floor((expedition.lodgings.length - 1) / 2)]

  return (
    expedition.journey.oneWayCostYen * 2 +
    (lodging?.nightlyCostYen ?? 0) * expedition.nights.default +
    (expedition.permit?.costYen ?? 0)
  )
}

describe('content scale targets', () => {
  it('lands inside the Phase 16 production ranges', () => {
    expect(playableRegions).toHaveLength(15)
    expect(content.species.length).toBeGreaterThanOrEqual(200)
    expect(content.species.length).toBeLessThanOrEqual(230)
    expect(content.spots.length).toBeGreaterThanOrEqual(130)
    expect(content.spots.length).toBeLessThanOrEqual(155)
    expect(content.buyers.length).toBeGreaterThanOrEqual(20)
    expect(content.buyers.length).toBeLessThanOrEqual(28)
  })

  it('gives every Phase 16 region 8-12 spots and 2-4 hidden spots', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const spots = content.spots.filter((spot) => String(spot.regionId) === regionId)
      const hidden = spots.filter((spot) => spot.visibility === 'hidden')

      expect(spots.length, `${regionId} spots`).toBeGreaterThanOrEqual(8)
      expect(spots.length, `${regionId} spots`).toBeLessThanOrEqual(12)
      expect(hidden.length, `${regionId} hidden`).toBeGreaterThanOrEqual(2)
      expect(hidden.length, `${regionId} hidden`).toBeLessThanOrEqual(4)
    }
  })

  it('gives every Phase 16 region two or more buyers', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const buyers = content.buyers.filter((buyer) => String(buyer.regionId) === regionId)

      expect(buyers.length, regionId).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('trust → rumor → hidden spot chains', () => {
  it('gives every Phase 16 region a three-threshold chain', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const buyers = content.buyers.filter((buyer) => String(buyer.regionId) === regionId)
      const rewards = content.contactRewards.filter((reward) =>
        buyers.some((buyer) => String(buyer.id) === String(reward.contactId)),
      )
      const intel = rewards.filter((reward) => reward.kind === 'intel').map((r) => r.minTrust)
      const discovery = rewards
        .filter((reward) => reward.kind === 'discover_spot')
        .map((r) => r.minTrust)

      expect(intel.length, `${regionId} intel`).toBeGreaterThanOrEqual(2)
      expect(discovery.length, `${regionId} discovery`).toBeGreaterThanOrEqual(1)

      const thresholds = new Set([...intel, ...discovery])

      expect(thresholds.size, `${regionId} thresholds`).toBeGreaterThanOrEqual(3)

      const lowestIntel = Math.min(...intel)
      const lowestDiscovery = Math.min(...discovery)

      // 1 回の売却で hidden spot まで解禁しない（Trust は取引あたり上限つき）。
      expect(lowestDiscovery, regionId).toBeGreaterThan(lowestIntel)
    }
  })

  it('varies thresholds between regions (no copy-paste chain)', () => {
    const signatures = PHASE_16_REGIONS.map((regionId) => {
      const buyers = content.buyers.filter((buyer) => String(buyer.regionId) === regionId)
      const rewards = content.contactRewards.filter((reward) =>
        buyers.some((buyer) => String(buyer.id) === String(reward.contactId)),
      )

      return rewards
        .map((reward) => reward.minTrust)
        .sort((left, right) => left - right)
        .join(',')
    })

    expect(new Set(signatures).size).toBeGreaterThanOrEqual(7)
  })

  it('keeps discovery separate from access', () => {
    // Secret Spot は「知っている」だけで行けるようにはしない（access 条件を持つ）。
    const hidden = content.spots.filter((spot) => spot.visibility === 'hidden')
    const withAccess = hidden.filter((spot) => spot.access.length > 0)

    expect(hidden.length).toBeGreaterThan(0)
    expect(withAccess.length / hidden.length).toBeGreaterThan(0.5)

    for (const spot of hidden) {
      expect(spot.travelOptions.length, String(spot.id)).toBeGreaterThan(0)
    }
  })

  it('does not need many sales for the first reward, nor a huge grind for discovery', () => {
    for (const regionId of PHASE_16_REGIONS) {
      const buyers = content.buyers.filter((buyer) => String(buyer.regionId) === regionId)
      const gain = Math.max(
        ...buyers.map((buyer) =>
          Math.min(
            buyer.trustProfile.maxPerTransaction,
            Math.round(
              buyer.trustProfile.perTransactionBase + buyer.trustProfile.qualityWeight * 0.5,
            ),
          ),
        ),
      )
      const rewards = content.contactRewards.filter((reward) =>
        buyers.some((buyer) => String(buyer.id) === String(reward.contactId)),
      )
      const first = Math.min(...rewards.filter((r) => r.kind === 'intel').map((r) => r.minTrust))
      const discovery = Math.min(
        ...rewards.filter((r) => r.kind === 'discover_spot').map((r) => r.minTrust),
      )

      expect(Math.ceil(first / gain), `${regionId} first`).toBeGreaterThanOrEqual(2)
      expect(Math.ceil(first / gain), `${regionId} first`).toBeLessThanOrEqual(5)
      expect(Math.ceil(discovery / gain), `${regionId} discovery`).toBeGreaterThanOrEqual(5)
      expect(Math.ceil(discovery / gain), `${regionId} discovery`).toBeLessThanOrEqual(15)
    }
  })
})

describe('expedition cost curve', () => {
  it('orders trips from the cheapest domestic to the most expensive overseas', () => {
    const totals = playableRegions
      .filter((region) => String(region.id) !== 'tokyo-area')
      .map((region) => ({
        regionId: String(region.id),
        total: expeditionTotal(String(region.id)),
        // Phase 19B: rail（国内鉄道遠征）も domestic 側に分類する。
        domestic:
          content.expeditions.find((entry) => String(entry.regionId) === String(region.id))?.journey
            .kind !== 'international_flight',
      }))
      .sort((left, right) => left.total - right.total)

    expect(totals[0]?.regionId).toBe('izu-peninsula')
    expect(totals[totals.length - 1]?.regionId).toBe('amazon-basin')

    const cheapestInternational = Math.min(
      ...totals.filter((entry) => !entry.domestic).map((entry) => entry.total),
    )
    const mostExpensiveDomestic = Math.max(
      ...totals.filter((entry) => entry.domestic).map((entry) => entry.total),
    )

    expect(mostExpensiveDomestic).toBeLessThan(cheapestInternational)
  })

  it('keeps every trip within a few months of free cash', () => {
    const freeCash = DEFAULT_ECONOMY_TUNING.monthlySalary - DEFAULT_ECONOMY_TUNING.monthlyLivingCost

    for (const region of playableRegions) {
      const regionId = String(region.id)

      if (regionId === 'tokyo-area') {
        continue
      }

      expect(expeditionTotal(regionId) / freeCash, regionId).toBeLessThanOrEqual(6)
    }
  })
})

describe('region selector UI', () => {
  const html = renderToStaticMarkup(createElement(MapScreen))

  it('exposes a scalable selector instead of a single tab strip', () => {
    expect(html).toContain('地域をえらぶ')
    expect(html).toContain('region-selector')

    for (const region of playableRegions) {
      expect(html, String(region.id)).toContain(region.name)
    }
  })

  it('marks the current region and keeps the map board', () => {
    expect(html).toContain('いま ここ')
    expect(html.indexOf('釣り場マップ')).toBeLessThan(html.indexOf('釣り場の詳細'))
  })
})
