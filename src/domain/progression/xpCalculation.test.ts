import { describe, expect, it } from 'vitest'
import { asFishSpeciesId } from '../ids'
import { DEFAULT_PROGRESSION_TUNING } from './ProgressionTuning'
import {
  baseXpForSpecies,
  calculateCatchXp,
  challengeMultiplierFor,
  sizeMultiplierFor,
  type CatchXpInput,
} from './xpCalculation'

const species = { id: asFishSpeciesId('test-species'), rarity: 1 }

const input = (overrides: Partial<CatchXpInput> = {}): CatchXpInput => ({
  species,
  percentile: 50,
  traits: [],
  firstCatch: false,
  personalRecord: false,
  newSpot: false,
  newMethod: false,
  repetitionCount: 1,
  ...overrides,
})

describe('size multiplier', () => {
  it('rewards rarer sizes more', () => {
    expect(sizeMultiplierFor(50).multiplier).toBe(1)
    expect(sizeMultiplierFor(90).multiplier).toBe(1.5)
    expect(sizeMultiplierFor(99).multiplier).toBe(3)
    expect(sizeMultiplierFor(99.9).multiplier).toBe(8)
  })

  it('labels the band', () => {
    expect(sizeMultiplierFor(99.95).label).toBe('top 0.1%')
    expect(sizeMultiplierFor(95).label).toBe('top 10%')
    expect(sizeMultiplierFor(10).label).toBe('normal')
  })
})

describe('challenge multiplier', () => {
  it('is neutral without traits', () => {
    expect(challengeMultiplierFor([])).toBe(1)
  })

  it('grows with difficult traits', () => {
    expect(challengeMultiplierFor(['aggressive'])).toBeGreaterThan(1)
    expect(challengeMultiplierFor(['trophy', 'aggressive'])).toBeGreaterThan(
      challengeMultiplierFor(['aggressive']),
    )
  })

  it('is capped by the tuning', () => {
    // 上限は将来 Trait が増えたときの安全弁。ここでは tuning を下げて挙動を確認する。
    const tuning = { ...DEFAULT_PROGRESSION_TUNING, maxChallengeMultiplier: 1.5 }

    expect(challengeMultiplierFor(['trophy', 'aggressive', 'strong_runner', 'old'], tuning)).toBe(
      1.5,
    )
  })
})

describe('catch xp', () => {
  it('scales the base xp with species rarity', () => {
    expect(baseXpForSpecies(1)).toBe(DEFAULT_PROGRESSION_TUNING.baseCatchXp)
    expect(baseXpForSpecies(3)).toBeGreaterThan(baseXpForSpecies(1))
  })

  it('gives an ordinary catch the base xp', () => {
    const breakdown = calculateCatchXp(input())

    expect(breakdown.total).toBe(DEFAULT_PROGRESSION_TUNING.baseCatchXp)
    expect(breakdown.discoveryBonus).toBe(0)
    expect(breakdown.decayMultiplier).toBe(1)
  })

  it('makes large individuals clearly more valuable', () => {
    const ordinary = calculateCatchXp(input({ percentile: 50 }))
    const large = calculateCatchXp(input({ percentile: 99 }))
    const huge = calculateCatchXp(input({ percentile: 99.95 }))

    expect(large.total).toBeGreaterThan(ordinary.total * 2)
    expect(huge.total).toBeGreaterThan(large.total * 2)
  })

  it('adds discovery bonuses without decaying them', () => {
    const breakdown = calculateCatchXp(
      input({ firstCatch: true, personalRecord: true, repetitionCount: 200 }),
    )

    expect(breakdown.factors.map((factor) => factor.label)).toEqual([
      'first catch',
      'personal record',
    ])
    expect(breakdown.discoveryBonus).toBe(
      DEFAULT_PROGRESSION_TUNING.firstCatchBonus + DEFAULT_PROGRESSION_TUNING.personalRecordBonus,
    )
    // 特別な捕獲は減衰しない。
    expect(breakdown.decayMultiplier).toBe(1)
  })

  it('decays only the multiplied part', () => {
    const fresh = calculateCatchXp(input({ repetitionCount: 3 }))
    const repeated = calculateCatchXp(input({ repetitionCount: 60 }))

    expect(repeated.decayMultiplier).toBeLessThan(fresh.decayMultiplier)
    expect(repeated.total).toBeLessThan(fresh.total)
    expect(repeated.base).toBe(fresh.base)
  })

  it('ignores decay for trophy and high percentile catches', () => {
    const trophy = calculateCatchXp(input({ repetitionCount: 500, traits: ['trophy'] }))
    expect(trophy.decayMultiplier).toBe(1)

    const record = calculateCatchXp(input({ repetitionCount: 500, percentile: 99.5 }))
    expect(record.decayMultiplier).toBe(1)
  })

  it('adds a bonus per extra trait', () => {
    const single = calculateCatchXp(input({ traits: ['aggressive'] }))
    const double = calculateCatchXp(input({ traits: ['aggressive', 'scarred'] }))

    expect(single.discoveryBonus).toBe(DEFAULT_PROGRESSION_TUNING.traitBonus)
    expect(double.discoveryBonus).toBe(DEFAULT_PROGRESSION_TUNING.traitBonus * 2)
  })

  it('never exceeds the per catch cap', () => {
    const extreme = calculateCatchXp(
      input({
        percentile: 99.99,
        traits: ['trophy', 'aggressive', 'strong_runner', 'old', 'heavy'],
        firstCatch: true,
        personalRecord: true,
        newSpot: true,
        newMethod: true,
        species: { id: asFishSpeciesId('rare'), rarity: 10 },
      }),
    )

    expect(extreme.total).toBeLessThanOrEqual(DEFAULT_PROGRESSION_TUNING.maxCatchXp)
    expect(extreme.total).toBeGreaterThan(0)
  })

  it('never returns negative or NaN', () => {
    for (const percentile of [0, 50, 100, -10, 1000, Number.NaN]) {
      const breakdown = calculateCatchXp(input({ percentile }))

      expect(Number.isFinite(breakdown.total)).toBe(true)
      expect(breakdown.total).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic', () => {
    expect(calculateCatchXp(input({ percentile: 99.5, firstCatch: true }))).toEqual(
      calculateCatchXp(input({ percentile: 99.5, firstCatch: true })),
    )
  })
})
