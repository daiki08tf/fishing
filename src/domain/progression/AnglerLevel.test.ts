import { describe, expect, it } from 'vitest'
import { addXp, skillPointsForLevel, totalXpForLevel, xpToNextLevel } from './AnglerLevel'
import { DEFAULT_PROGRESSION_TUNING } from './ProgressionTuning'

describe('angler level curve', () => {
  it('increases the requirement with level', () => {
    expect(xpToNextLevel(2)).toBeGreaterThan(xpToNextLevel(1))
    expect(xpToNextLevel(20)).toBeGreaterThan(xpToNextLevel(10))
    expect(xpToNextLevel(99)).toBeGreaterThan(xpToNextLevel(50))
  })

  it('is front loaded so early levels come quickly', () => {
    expect(xpToNextLevel(1)).toBeLessThan(150)
    expect(xpToNextLevel(1) / xpToNextLevel(50)).toBeLessThan(0.05)
  })

  it('has no requirement at or beyond the maximum level', () => {
    expect(xpToNextLevel(DEFAULT_PROGRESSION_TUNING.maxLevel)).toBe(0)
    expect(xpToNextLevel(120)).toBe(0)
  })

  it('sums the cumulative requirement', () => {
    expect(totalXpForLevel(1)).toBe(0)
    expect(totalXpForLevel(2)).toBe(xpToNextLevel(1))
    expect(totalXpForLevel(3)).toBe(xpToNextLevel(1) + xpToNextLevel(2))
  })

  it('stays finite all the way to the maximum level', () => {
    const total = totalXpForLevel(DEFAULT_PROGRESSION_TUNING.maxLevel)

    expect(Number.isFinite(total)).toBe(true)
    expect(total).toBeGreaterThan(100_000)
  })

  it('grants skill points per level, with bonus levels', () => {
    expect(skillPointsForLevel(2)).toBe(1)
    expect(skillPointsForLevel(9)).toBe(1)
    expect(skillPointsForLevel(10)).toBe(2)
    expect(skillPointsForLevel(11)).toBe(1)
  })
})

describe('addXp', () => {
  it('adds xp without levelling up', () => {
    const result = addXp({ level: 1, xp: 0, totalXp: 0, gained: 10 })

    expect(result.level).toBe(1)
    expect(result.xp).toBe(10)
    expect(result.totalXp).toBe(10)
    expect(result.levelsGained).toEqual([])
    expect(result.skillPointsGained).toBe(0)
  })

  it('levels up exactly on the boundary', () => {
    const required = xpToNextLevel(1)
    const result = addXp({ level: 1, xp: 0, totalXp: 0, gained: required })

    expect(result.level).toBe(2)
    expect(result.xp).toBe(0)
    expect(result.levelsGained).toEqual([2])
    expect(result.skillPointsGained).toBe(skillPointsForLevel(2))
  })

  it('carries the remainder into the next level', () => {
    const result = addXp({ level: 1, xp: 0, totalXp: 0, gained: xpToNextLevel(1) + 5 })

    expect(result.level).toBe(2)
    expect(result.xp).toBe(5)
  })

  it('counts every level when several are gained at once', () => {
    const result = addXp({ level: 1, xp: 0, totalXp: 0, gained: 2000 })

    expect(result.level).toBeGreaterThan(3)
    expect(result.levelsGained).toHaveLength(result.level - 1)

    let expectedPoints = 0

    for (const level of result.levelsGained) {
      expectedPoints += skillPointsForLevel(level)
    }

    expect(result.skillPointsGained).toBe(expectedPoints)
    // 節目のレベル (10) を通過していればボーナス分が増えている。
    expect(result.skillPointsGained).toBeGreaterThan(result.levelsGained.length - 1)
  })

  it('reaches the maximum level with the cumulative requirement', () => {
    const total = totalXpForLevel(DEFAULT_PROGRESSION_TUNING.maxLevel)
    const result = addXp({ level: 1, xp: 0, totalXp: 0, gained: total })

    expect(result.level).toBe(DEFAULT_PROGRESSION_TUNING.maxLevel)
  })

  it('stops at the maximum level without overflowing xp', () => {
    const result = addXp({ level: 99, xp: 0, totalXp: 0, gained: 10_000_000 })

    expect(result.level).toBe(DEFAULT_PROGRESSION_TUNING.maxLevel)
    expect(result.xp).toBe(0)
    expect(Number.isFinite(result.totalXp)).toBe(true)
    expect(result.totalXp).toBeGreaterThan(0)
  })

  it('ignores negative and fractional gains', () => {
    const negative = addXp({ level: 5, xp: 10, totalXp: 100, gained: -50 })
    expect(negative.level).toBe(5)
    expect(negative.xp).toBe(10)
    expect(negative.totalXp).toBe(100)

    const fractional = addXp({ level: 5, xp: 10, totalXp: 100, gained: 2.4 })
    expect(fractional.xp).toBe(12)
  })

  it('is deterministic', () => {
    expect(addXp({ level: 3, xp: 5, totalXp: 400, gained: 1500 })).toEqual(
      addXp({ level: 3, xp: 5, totalXp: 400, gained: 1500 }),
    )
  })
})
