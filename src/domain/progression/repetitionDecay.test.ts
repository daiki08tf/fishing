import { describe, expect, it } from 'vitest'
import {
  decayMultiplier,
  decayMultiplierForCount,
  emptyRepetitionState,
  incrementRepetition,
  NO_DECAY_RELIEF,
  repetitionCountForSpecies,
} from './repetitionDecay'

describe('repetition decay', () => {
  it('keeps the first few catches at full value', () => {
    expect(decayMultiplierForCount(1)).toBe(1)
    expect(decayMultiplierForCount(5)).toBe(1)
  })

  it('reduces the value as the same species is repeated', () => {
    expect(decayMultiplierForCount(6)).toBe(0.8)
    expect(decayMultiplierForCount(10)).toBe(0.8)
    expect(decayMultiplierForCount(11)).toBe(0.6)
    expect(decayMultiplierForCount(20)).toBe(0.6)
    expect(decayMultiplierForCount(21)).toBe(0.3)
    expect(decayMultiplierForCount(50)).toBe(0.3)
    expect(decayMultiplierForCount(51)).toBe(0.1)
    expect(decayMultiplierForCount(5000)).toBe(0.1)
  })

  it('never returns more than 1 and never negative', () => {
    for (const count of [0, 1, 7, 100, 100000]) {
      const value = decayMultiplierForCount(count)
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('ignores decay for special catches', () => {
    const cases = [
      { firstCatch: true },
      { personalRecord: true },
      { trophy: true },
      { highPercentile: true },
      { newSpot: true },
      { newMethod: true },
    ]

    for (const relief of cases) {
      expect(
        decayMultiplier({
          count: 100,
          relief: { ...NO_DECAY_RELIEF, ...relief },
        }),
      ).toBe(1)
    }
  })

  it('applies decay when nothing special happened', () => {
    expect(decayMultiplier({ count: 100, relief: NO_DECAY_RELIEF })).toBe(0.1)
  })

  it('counts species, spots and methods independently', () => {
    let state = emptyRepetitionState()

    state = incrementRepetition(state, { speciesId: 'a', spotId: 's1', methodId: 'm1' })
    state = incrementRepetition(state, { speciesId: 'a', spotId: 's1' })
    state = incrementRepetition(state, { speciesId: 'b', spotId: 's2', methodId: 'm1' })

    expect(repetitionCountForSpecies(state, 'a')).toBe(2)
    expect(repetitionCountForSpecies(state, 'b')).toBe(1)
    expect(repetitionCountForSpecies(state, 'unknown')).toBe(0)
    expect(state.spots['s1']).toBe(2)
    expect(state.spots['s2']).toBe(1)
    expect(state.methods['m1']).toBe(2)
  })

  it('does not mutate the previous state', () => {
    const state = emptyRepetitionState()
    const next = incrementRepetition(state, { speciesId: 'a' })

    expect(state.species['a']).toBeUndefined()
    expect(next.species['a']).toBe(1)
  })
})
