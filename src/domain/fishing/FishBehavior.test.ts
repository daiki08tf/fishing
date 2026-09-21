import { describe, expect, it } from 'vitest'
import type { RandomSource } from '../rng/RandomSource'
import { decideBehavior, runChance } from './FishBehavior'
import { DEFAULT_FISHING_TUNING } from './FishingTuning'

/** テスト用の固定乱数。next() は与えた値を順に返す。 */
const sequenceRandom = (values: readonly number[], intValue = 0): RandomSource => {
  let index = 0

  return {
    next: () => {
      const value = values[index] ?? 0
      index += 1
      return value
    },
    int: () => intValue,
    pick: <T>(items: readonly T[]): T => items[0] as T,
  }
}

describe('fish behavior', () => {
  it('raises the chance to run for faster fish', () => {
    const slow = runChance({ speed: 0.1, staminaRatio: 1 }, DEFAULT_FISHING_TUNING)
    const fast = runChance({ speed: 0.9, staminaRatio: 1 }, DEFAULT_FISHING_TUNING)

    expect(fast).toBeGreaterThan(slow)
  })

  it('lowers the chance to run as the fish tires', () => {
    const fresh = runChance({ speed: 0.5, staminaRatio: 1 }, DEFAULT_FISHING_TUNING)
    const tired = runChance({ speed: 0.5, staminaRatio: 0 }, DEFAULT_FISHING_TUNING)

    expect(tired).toBeLessThan(fresh)
  })

  it('starts a run when the draw is below the chance', () => {
    const decision = decideBehavior({
      state: { behavior: 'normal', runTicksRemaining: 0 },
      context: { speed: 1, staminaRatio: 1 },
      random: sequenceRandom([0], 7),
      tuning: DEFAULT_FISHING_TUNING,
    })

    expect(decision).toEqual({ behavior: 'run', runTicksRemaining: 7, changed: true })
  })

  it('stays normal when the draw is above the chance', () => {
    const decision = decideBehavior({
      state: { behavior: 'normal', runTicksRemaining: 0 },
      context: { speed: 0, staminaRatio: 0 },
      random: sequenceRandom([0.999], 7),
      tuning: DEFAULT_FISHING_TUNING,
    })

    expect(decision).toEqual({ behavior: 'normal', runTicksRemaining: 0, changed: false })
  })

  it('keeps running while the run has remaining ticks', () => {
    const decision = decideBehavior({
      state: { behavior: 'run', runTicksRemaining: 3 },
      context: { speed: 0.5, staminaRatio: 1 },
      random: sequenceRandom([0.999]),
      tuning: DEFAULT_FISHING_TUNING,
    })

    expect(decision).toEqual({ behavior: 'run', runTicksRemaining: 2, changed: false })
  })

  it('returns to normal when the run is over', () => {
    const decision = decideBehavior({
      state: { behavior: 'run', runTicksRemaining: 1 },
      context: { speed: 0.5, staminaRatio: 1 },
      random: sequenceRandom([0.999]),
      tuning: DEFAULT_FISHING_TUNING,
    })

    expect(decision).toEqual({ behavior: 'normal', runTicksRemaining: 0, changed: true })
  })
})
