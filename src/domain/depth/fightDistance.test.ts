import { describe, expect, it } from 'vitest'
import { depthToFightDistanceM } from './fightDistance'

describe('depthToFightDistanceM', () => {
  it('is never negative', () => {
    expect(depthToFightDistanceM(0)).toBe(0)
    expect(depthToFightDistanceM(-5)).toBe(0)
  })

  it('is monotonically non-decreasing as depth increases', () => {
    const depths = [0, 5, 10, 20, 35, 50, 75, 100, 150, 200, 260]
    const distances = depths.map(depthToFightDistanceM)

    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1] as number)
    }
  })

  it('grows sublinearly (200m is far less than 10x a 20m fight)', () => {
    const at20 = depthToFightDistanceM(20)
    const at200 = depthToFightDistanceM(200)

    expect(at200).toBeLessThan(at20 * 10)
    expect(at200).toBeGreaterThan(at20)
  })

  it('stays in a roughly playable range for very deep water', () => {
    // 深場でも「1m = 1 step」のような線形爆発にはしない（PROVISIONAL な目安）。
    expect(depthToFightDistanceM(100)).toBeLessThan(70)
    expect(depthToFightDistanceM(200)).toBeLessThan(90)
  })
})
