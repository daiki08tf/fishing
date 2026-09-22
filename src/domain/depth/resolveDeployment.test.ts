import { describe, expect, it } from 'vitest'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import type { FishingZone } from '../world/FishingSpot'
import type { DepthCapability } from './DepthCapability'
import { resolveDeployment } from './resolveDeployment'

const capability: DepthCapability = {
  comfortableDepthM: 40,
  maxDepthM: 90,
  control: 0.7,
  reserveLineM: 20,
}

const zones: readonly FishingZone[] = [
  { id: 'surface', name: '表層', depthRangeM: { min: 0, max: 10 }, habitatTags: [] },
  { id: 'mid', name: '中層', depthRangeM: { min: 10, max: 35 }, habitatTags: [] },
  { id: 'bottom', name: '底', depthRangeM: { min: 35, max: 100 }, habitatTags: [] },
]

describe('resolveDeployment', () => {
  it('is deterministic for the same seed', () => {
    const first = resolveDeployment({
      zones,
      targetZoneId: 'bottom',
      capability,
      random: new SeededRandomSource('deploy-test-1'),
    })
    const second = resolveDeployment({
      zones,
      targetZoneId: 'bottom',
      capability,
      random: new SeededRandomSource('deploy-test-1'),
    })

    expect(second).toEqual(first)
  })

  it('lands within the target zone depth range most of the time (clean quality)', () => {
    const result = resolveDeployment({
      zones,
      targetZoneId: 'mid',
      capability,
      random: new SeededRandomSource('deploy-test-clean'),
    })

    expect(result.reachable).toBe(true)

    if (result.reachable) {
      expect(result.actualDepthM).toBeGreaterThanOrEqual(0)
      expect(result.actualDepthM).toBeLessThanOrEqual(capability.maxDepthM)
    }
  })

  it('reports unreachable when maxDepthM cannot physically reach the zone', () => {
    const shallowCapability: DepthCapability = {
      comfortableDepthM: 10,
      maxDepthM: 15,
      control: 0.5,
      reserveLineM: 20,
    }

    const result = resolveDeployment({
      zones,
      targetZoneId: 'bottom',
      capability: shallowCapability,
      random: new SeededRandomSource('deploy-test-unreachable'),
    })

    expect(result.reachable).toBe(false)
  })

  it('falls back to the first zone for an unknown targetZoneId', () => {
    const result = resolveDeployment({
      zones,
      targetZoneId: 'does-not-exist',
      capability,
      random: new SeededRandomSource('deploy-test-fallback'),
    })

    expect(result.targetZoneId).toBe(zones[0]?.id)
  })

  it('marks a miss as drifted (not shallow/deep) when there is meaningful current (Phase 17B)', () => {
    // 表層（0〜10m）は幅が狭く、fast drift の spread（±約10m）で高確率に隣接 Zone へ逸れる。
    const qualities = Array.from({ length: 30 }, (_, index) => {
      const result = resolveDeployment({
        zones,
        targetZoneId: 'surface',
        capability,
        random: new SeededRandomSource(`drift-test-${String(index)}`),
        drift: 'fast',
      })

      return result.reachable ? result.quality : null
    })

    expect(qualities).toContain('drifted')
    expect(qualities).not.toContain('shallow')
    expect(qualities).not.toContain('deep')
  })

  it('a stronger drift widens the spread of actual depths (Phase 17B)', () => {
    const depthsFor = (drift: 'slow' | 'fast'): readonly number[] =>
      Array.from({ length: 20 }, (_, index) => {
        const result = resolveDeployment({
          zones,
          targetZoneId: 'mid',
          capability,
          random: new SeededRandomSource(`spread-${drift}-${String(index)}`),
          drift,
        })

        return result.reachable ? result.actualDepthM : 0
      })

    const spreadOf = (values: readonly number[]): number =>
      Math.max(...values) - Math.min(...values)

    expect(spreadOf(depthsFor('fast'))).toBeGreaterThan(spreadOf(depthsFor('slow')))
  })

  it('never produces a negative actual depth', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const result = resolveDeployment({
        zones,
        targetZoneId: 'surface',
        capability,
        random: new SeededRandomSource(seed),
      })

      if (result.reachable) {
        expect(result.actualDepthM).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
