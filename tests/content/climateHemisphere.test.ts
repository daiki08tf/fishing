import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import {
  HEMISPHERES,
  seasonOf,
  seasonalFactor,
  type ClimateProfile,
} from '../../src/domain/environment'
import { resolveEnvironment } from '../../src/domain/environment/environmentResolver'

/**
 * Phase 16 Part 2b — 半球と熱帯気候。
 *
 * Environment は「暦月 → 季節 / 水温」を半球つきで解決する。
 * 南半球（New Zealand / Queensland）は 1 月が夏、7 月が冬になる。
 * Region ID で分岐せず、ClimateProfile.hemisphere だけを見る。
 */

const content = loadContentFromDirectory()

const climateOf = (regionId: string): ClimateProfile => {
  const region = content.regions.find((entry) => String(entry.id) === regionId)

  if (region === undefined) {
    throw new Error(`unknown region ${regionId}`)
  }

  return region.climate
}

const waterTempAt = (regionId: string, month: number): number =>
  resolveEnvironment({
    time: { year: 2026, month, day: 15, hour: 9, minute: 0 },
    climate: climateOf(regionId),
    regionId,
    environment: 'bay_shore',
  }).water.temperatureC

describe('hemisphere seasonality', () => {
  it('keeps the northern calendar unchanged', () => {
    expect(seasonOf(1)).toBe('winter')
    expect(seasonOf(4)).toBe('spring')
    expect(seasonOf(7)).toBe('summer')
    expect(seasonOf(10)).toBe('autumn')
    expect(seasonalFactor(8)).toBeGreaterThan(0.9)
    expect(seasonalFactor(2)).toBeLessThan(-0.9)
  })

  it('inverts the southern calendar', () => {
    expect(seasonOf(1, 'south')).toBe('summer')
    expect(seasonOf(7, 'south')).toBe('winter')
    expect(seasonOf(10, 'south')).toBe('spring')
    expect(seasonOf(4, 'south')).toBe('autumn')

    // 南半球のピークは 2 月、底は 8 月。
    expect(seasonalFactor(2, 'south')).toBeGreaterThan(0.99)
    expect(seasonalFactor(8, 'south')).toBeLessThan(-0.99)
    expect(seasonalFactor(1, 'south')).toBeGreaterThan(0.8)
    expect(seasonalFactor(7, 'south')).toBeLessThan(-0.8)
  })

  it('supports exactly two hemispheres and defaults to north', () => {
    expect(HEMISPHERES).toEqual(['north', 'south'])
    expect(seasonOf(1)).toBe(seasonOf(1, 'north'))
    expect(seasonalFactor(1)).toBe(seasonalFactor(1, 'north'))
  })

  it('marks New Zealand and Queensland as southern, everything else as northern', () => {
    expect(climateOf('new-zealand').hemisphere).toBe('south')
    expect(climateOf('queensland').hemisphere).toBe('south')

    for (const region of content.regions) {
      const regionId = String(region.id)

      if (regionId === 'new-zealand' || regionId === 'queensland') {
        continue
      }

      expect(region.climate.hemisphere, regionId).toBe('north')
    }
  })

  it('makes southern temperate water warmer in January than in July', () => {
    // 南半球の temperate（NZ）: 1 月が夏。
    expect(waterTempAt('new-zealand', 1)).toBeGreaterThan(waterTempAt('new-zealand', 7))
    expect(waterTempAt('queensland', 1)).toBeGreaterThan(waterTempAt('queensland', 7))

    // 北半球（東京）は逆。
    expect(waterTempAt('tokyo-area', 7)).toBeGreaterThan(waterTempAt('tokyo-area', 1))
  })

  it('exposes the season to the rest of the game for a southern region', () => {
    const january = resolveEnvironment({
      time: { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
      climate: climateOf('new-zealand'),
      regionId: 'new-zealand',
      environment: 'river',
    })
    const july = resolveEnvironment({
      time: { year: 2026, month: 7, day: 15, hour: 9, minute: 0 },
      climate: climateOf('new-zealand'),
      regionId: 'new-zealand',
      environment: 'river',
    })

    expect(january.season).toBe('summer')
    expect(july.season).toBe('winter')
  })
})

describe('tropical climate sanity', () => {
  const TROPICAL = ['queensland', 'okinawa', 'thailand', 'amazon-basin'] as const
  const TEMPERATE = ['tokyo-area', 'hokkaido', 'alaska', 'norway-fjords', 'new-zealand'] as const

  it('keeps tropical annual variation smaller than temperate variation', () => {
    const tropicalSwing = Math.max(
      ...TROPICAL.map((regionId) => climateOf(regionId).seasonalSwingC),
    )
    const temperateSwing = Math.min(
      ...TEMPERATE.map((regionId) => climateOf(regionId).seasonalSwingC),
    )

    expect(tropicalSwing).toBeLessThan(temperateSwing)
  })

  it('keeps tropical water warm all year round', () => {
    for (const regionId of TROPICAL) {
      const temps = [1, 4, 7, 10].map((month) => waterTempAt(regionId, month))

      for (const temp of temps) {
        expect(temp, `${regionId} water`).toBeGreaterThanOrEqual(18)
      }

      const range = Math.max(...temps) - Math.min(...temps)

      // 熱帯は年間の振れが小さい（PROVISIONAL なゲーム調整値）。
      expect(range, `${regionId} range`).toBeLessThan(12)
    }
  })

  it('keeps the annual mean of each tropical region warm', () => {
    for (const regionId of TROPICAL) {
      expect(climateOf(regionId).annualMeanWaterC, regionId).toBeGreaterThanOrEqual(24)
    }
  })

  it('keeps the cold regions cold (sanity, not a claim)', () => {
    expect(waterTempAt('alaska', 1)).toBeLessThan(waterTempAt('okinawa', 1))
    expect(waterTempAt('hokkaido', 1)).toBeLessThan(waterTempAt('thailand', 1))
  })
})
