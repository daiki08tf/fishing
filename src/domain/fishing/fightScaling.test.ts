import { describe, expect, it } from 'vitest'
import { DEFAULT_BATTLE_TUNING } from './BattleTuning'
import { fishMassIndex, fightDistanceSizeIndex } from './fishMassIndex'

/**
 * Phase 18A: 大型魚スケーリングの性質テスト。
 *
 * 要求:
 * - 単調増加
 * - sublinear（knee 以降の伸びは体重比より緩い）
 * - knee で不連続がない
 * - 小型魚は Phase 17 と同じ値
 * - 30kg と 150kg が同じ値に潰れない（hard cap なし）
 */
describe('fishMassIndex', () => {
  const weights = [0.5, 2, 5, 10, 30, 80, 150, 300, 450]

  it('is monotonically non-decreasing', () => {
    const values = weights.map((kg) => fishMassIndex(kg, DEFAULT_BATTLE_TUNING))

    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] ?? 0)
    }
  })

  it('matches Phase 17 linear behaviour below the knee (12.5kg)', () => {
    // 旧式: clamp(weightKg / 2.5, 0.3, 5)
    const legacy = (kg: number): number => Math.min(5, Math.max(0.3, kg / 2.5))

    for (const kg of [0.5, 2, 5, 10, 12.5]) {
      expect(fishMassIndex(kg, DEFAULT_BATTLE_TUNING)).toBeCloseTo(legacy(kg), 10)
    }
  })

  it('is continuous at the knee', () => {
    const knee = 12.5
    const below = fishMassIndex(knee - 0.001, DEFAULT_BATTLE_TUNING)
    const above = fishMassIndex(knee + 0.001, DEFAULT_BATTLE_TUNING)

    expect(Math.abs(above - below)).toBeLessThan(0.01)
  })

  it('is sublinear above the knee', () => {
    // 150kg は 30kg の 5 倍の重さだが、mass index は 5 倍未満でなければならない。
    const at30 = fishMassIndex(30, DEFAULT_BATTLE_TUNING)
    const at150 = fishMassIndex(150, DEFAULT_BATTLE_TUNING)

    expect(at150).toBeGreaterThan(at30)
    expect(at150 / at30).toBeLessThan(5)
  })

  it('does not collapse large fish into one value (no hard cap)', () => {
    const at30 = fishMassIndex(30, DEFAULT_BATTLE_TUNING)
    const at150 = fishMassIndex(150, DEFAULT_BATTLE_TUNING)
    const at450 = fishMassIndex(450, DEFAULT_BATTLE_TUNING)

    expect(at150).toBeGreaterThan(at30 * 1.5)
    expect(at450).toBeGreaterThan(at150 * 1.3)
  })
})

describe('fightDistanceSizeIndex', () => {
  it('is identity below the knee', () => {
    for (const sf of [0.3, 1, 2.5, 5]) {
      expect(fightDistanceSizeIndex(sf, DEFAULT_BATTLE_TUNING)).toBeCloseTo(sf, 10)
    }
  })

  it('compresses beyond the knee but keeps growing', () => {
    const at7 = fightDistanceSizeIndex(7.7, DEFAULT_BATTLE_TUNING)
    const at17 = fightDistanceSizeIndex(17.3, DEFAULT_BATTLE_TUNING)
    const at30 = fightDistanceSizeIndex(30, DEFAULT_BATTLE_TUNING)

    expect(at7).toBeGreaterThan(5)
    expect(at7).toBeLessThan(7.7)
    expect(at17).toBeGreaterThan(at7)
    expect(at30).toBeGreaterThan(at17)
    // 30 → 距離は 6 + 10*index で 150m 未満に収まること（単調な長期戦にしない）。
    expect(at30).toBeLessThan(14)
  })
})
