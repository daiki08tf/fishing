import { describe, expect, it } from 'vitest'
import { resolveCanCast } from './canCast'

/**
 * Phase 17 Final Fix — MarineReadiness が false のとき CAST を実際に止める。
 *
 * これまで `resolveMarineReadiness` は計算・表示されるだけで、`canCast` には
 * 反映されていなかった（有効なのに押しても何も起きないボタンになっていた bug）。
 */
describe('resolveCanCast', () => {
  const reachableCast = { reachable: true }
  const unreachableCast = { reachable: false }

  it('allows casting when everything is fine (cast zone)', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: true,
        marineReadiness: { ok: true },
        isDepthTargetZone: false,
        resolvedCast: reachableCast,
        resolvedDeployment: null,
      }),
    ).toBe(true)
  })

  it('allows casting when marineReadiness has not been resolved yet (null = not blocking)', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: true,
        marineReadiness: null,
        isDepthTargetZone: false,
        resolvedCast: reachableCast,
        resolvedDeployment: null,
      }),
    ).toBe(true)
  })

  it('blocks casting when marineReadiness is not ok, even though the zone is reachable', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: true,
        marineReadiness: { ok: false, reason: '海況が荒れている' },
        isDepthTargetZone: false,
        resolvedCast: reachableCast,
        resolvedDeployment: null,
      }),
    ).toBe(false)
  })

  it('blocks depth deployment the same way marineReadiness gates it', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: true,
        marineReadiness: { ok: false, reason: '海況が荒れている' },
        isDepthTargetZone: true,
        resolvedCast: null,
        resolvedDeployment: { reachable: true },
      }),
    ).toBe(false)
  })

  it('still blocks on method/platform incompatibility regardless of marineReadiness', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: false,
        marineReadiness: { ok: true },
        isDepthTargetZone: false,
        resolvedCast: reachableCast,
        resolvedDeployment: null,
      }),
    ).toBe(false)
  })

  it('still blocks on an unreachable cast even when marineReadiness is ok', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: true,
        marineReadiness: { ok: true },
        isDepthTargetZone: false,
        resolvedCast: unreachableCast,
        resolvedDeployment: null,
      }),
    ).toBe(false)
  })

  it('requires resolvedDeployment.reachable for depth-target zones, ignoring resolvedCast', () => {
    expect(
      resolveCanCast({
        methodPlatformOk: true,
        marineReadiness: { ok: true },
        isDepthTargetZone: true,
        resolvedCast: reachableCast,
        resolvedDeployment: null,
      }),
    ).toBe(false)
  })
})
