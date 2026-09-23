import { describe, expect, it } from 'vitest'
import type { ResolvedCast } from '../../src/domain/casting/Casting'
import type { ResolvedDeployment } from '../../src/domain/depth/resolveDeployment'
import { actualLandedZoneId } from '../../src/ui/fishing/useFishingSession'

/**
 * Phase 19D — Catch Result の zone recap authority。
 *
 * Result に出すのは「狙った Zone」ではなく**実際に着水した Zone**だけ。
 * この authority は Encounter 重み・根ズレ・表示で共有される。
 */

const cast = (targetZoneId: string, landedZoneId: string): ResolvedCast => ({
  reachable: true,
  targetZoneId,
  landedZoneId,
  status: 'reachable',
  actualDistanceM: 50,
  quality: landedZoneId === targetZoneId ? 'clean' : 'long',
})

const deployment = (targetZoneId: string, landedZoneId: string): ResolvedDeployment => ({
  reachable: true,
  targetZoneId,
  landedZoneId,
  status: 'reachable',
  targetDepthM: 35,
  actualDepthM: 40,
  quality: landedZoneId === targetZoneId ? 'clean' : 'drifted',
})

describe('actualLandedZoneId (single authority for zone recap)', () => {
  it('returns the landed zone, not the selected zone, when the cast drifts', () => {
    // 狙い: 潮のよれ（slack）→ 実着水: 水道本流（channel）。
    expect(
      actualLandedZoneId({
        isDepthTargetZone: false,
        resolvedDeployment: null,
        resolvedCast: cast('slack', 'channel'),
        activeTargetZoneId: 'slack',
      }),
    ).toBe('channel')
  })

  it('returns the landed zone for depth deployment drift as well', () => {
    expect(
      actualLandedZoneId({
        isDepthTargetZone: true,
        resolvedDeployment: deployment('mid', 'se-base'),
        resolvedCast: null,
        activeTargetZoneId: 'mid',
      }),
    ).toBe('se-base')
  })

  it('falls back to the selected zone only when the cast never resolved', () => {
    expect(
      actualLandedZoneId({
        isDepthTargetZone: false,
        resolvedDeployment: null,
        resolvedCast: { reachable: false, targetZoneId: 'slack', status: 'unreachable' },
        activeTargetZoneId: 'slack',
      }),
    ).toBe('slack')
  })

  it('is null for zone-less fishing (no target, no resolved cast)', () => {
    expect(
      actualLandedZoneId({
        isDepthTargetZone: false,
        resolvedDeployment: null,
        resolvedCast: null,
        activeTargetZoneId: null,
      }),
    ).toBeNull()
  })
})
