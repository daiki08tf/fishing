import { describe, expect, it } from 'vitest'
import { asFishIndividualId, asFishSpeciesId } from '../ids'
import type { FishRecordEntry } from './FishRecord'
import { emptyCodexState } from './FishRecord'
import { recordCatch, recordedSpeciesCount } from './fishRecordService'

const speciesId = asFishSpeciesId('test-species')

const entry = (overrides: Partial<FishRecordEntry> = {}): FishRecordEntry => ({
  individualId: asFishIndividualId('test-species#a'),
  speciesId,
  lengthCm: 25,
  weightKg: 0.4,
  condition: 0.5,
  percentile: 50,
  traits: [],
  ...overrides,
})

describe('fish record service', () => {
  it('records the first catch of a species', () => {
    const outcome = recordCatch(emptyCodexState(), entry())

    expect(outcome.isFirstCatchOfSpecies).toBe(true)
    expect(outcome.isPersonalBest).toBe(true)
    expect(outcome.record.catchCount).toBe(1)
    expect(outcome.record.largestLengthCm).toBe(25)
    expect(outcome.record.personalBest.individualId).toBe('test-species#a')
    expect(recordedSpeciesCount(outcome.state)).toBe(1)
  })

  it('counts repeated catches of the same species', () => {
    const first = recordCatch(emptyCodexState(), entry())
    const second = recordCatch(first.state, entry({ individualId: asFishIndividualId('b') }))
    const third = recordCatch(second.state, entry({ individualId: asFishIndividualId('c') }))

    expect(third.record.catchCount).toBe(3)
    expect(third.isFirstCatchOfSpecies).toBe(false)
    expect(recordedSpeciesCount(third.state)).toBe(1)
  })

  it('updates the largest and heaviest records only when they grow', () => {
    const first = recordCatch(emptyCodexState(), entry({ lengthCm: 30, weightKg: 0.5 }))
    const smaller = recordCatch(
      first.state,
      entry({ individualId: asFishIndividualId('b'), lengthCm: 20, weightKg: 0.3 }),
    )

    expect(smaller.updatedLargestLength).toBe(false)
    expect(smaller.updatedHeaviestWeight).toBe(false)
    expect(smaller.record.largestLengthCm).toBe(30)
    expect(smaller.record.heaviestWeightKg).toBe(0.5)

    const bigger = recordCatch(
      smaller.state,
      entry({ individualId: asFishIndividualId('c'), lengthCm: 34, weightKg: 0.7 }),
    )

    expect(bigger.updatedLargestLength).toBe(true)
    expect(bigger.updatedHeaviestWeight).toBe(true)
    expect(bigger.record.largestLengthCm).toBe(34)
    expect(bigger.record.heaviestWeightKg).toBe(0.7)
  })

  it('treats a rarer size as the personal best', () => {
    const first = recordCatch(emptyCodexState(), entry({ percentile: 70 }))
    const common = recordCatch(
      first.state,
      entry({ individualId: asFishIndividualId('common'), percentile: 40 }),
    )

    expect(common.isPersonalBest).toBe(false)
    expect(common.record.personalBest.individualId).toBe('test-species#a')

    const rare = recordCatch(
      common.state,
      entry({ individualId: asFishIndividualId('rare'), percentile: 99.5 }),
    )

    expect(rare.isPersonalBest).toBe(true)
    expect(rare.record.personalBest.individualId).toBe('rare')
    expect(rare.record.bestPercentile).toBe(99.5)
  })

  it('accumulates the traits that were seen', () => {
    const first = recordCatch(emptyCodexState(), entry({ traits: ['heavy'] }))
    const second = recordCatch(
      first.state,
      entry({ individualId: asFishIndividualId('b'), traits: ['heavy', 'trophy'] }),
    )

    expect(second.newTraits).toEqual(['trophy'])
    expect(second.record.caughtTraits).toEqual(['heavy', 'trophy'])
  })

  it('keeps species apart', () => {
    const first = recordCatch(emptyCodexState(), entry())
    const other = recordCatch(
      first.state,
      entry({
        individualId: asFishIndividualId('other'),
        speciesId: asFishSpeciesId('other-species'),
      }),
    )

    expect(recordedSpeciesCount(other.state)).toBe(2)
    expect(other.isFirstCatchOfSpecies).toBe(true)
  })

  it('does not mutate the previous state', () => {
    const state = emptyCodexState()
    const first = recordCatch(state, entry())

    expect(recordedSpeciesCount(state)).toBe(0)
    expect(first.record.catchCount).toBe(1)
  })
})
