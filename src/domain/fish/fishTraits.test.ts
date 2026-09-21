import { describe, expect, it } from 'vitest'
import type { RandomSource } from '../rng/RandomSource'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { FISH_TRAITS } from './FishTrait'
import {
  combineTraitModifiers,
  DEFAULT_TRAIT_CONFIGURATION,
  NO_TRAIT_MODIFIERS,
  resolveTraits,
  resolveTraitConfiguration,
  TRAIT_MODIFIERS,
  type TraitResolutionContext,
} from './fishTraits'

const context = (overrides: Partial<TraitResolutionContext> = {}): TraitResolutionContext => ({
  configuration: DEFAULT_TRAIT_CONFIGURATION,
  percentile: 50,
  weightRatio: 1,
  speciesSpeed: 0.5,
  ...overrides,
})

/** 乱数の消費回数を数える。 */
const countingRandom = (
  seed: string,
): { readonly random: RandomSource; readonly draws: () => number } => {
  const inner = new SeededRandomSource(seed)
  let count = 0

  return {
    random: {
      next: () => {
        count += 1
        return inner.next()
      },
      int: (min, max) => inner.int(min, max),
      pick: <T>(items: readonly T[]): T => items[0] as T,
    },
    draws: () => count,
  }
}

const countTrait = (
  trait: (typeof FISH_TRAITS)[number],
  overrides: Partial<TraitResolutionContext>,
  attempts = 400,
): number => {
  let total = 0

  for (let seed = 0; seed < attempts; seed += 1) {
    const traits = resolveTraits(context(overrides), new SeededRandomSource(seed))

    if (traits.includes(trait)) {
      total += 1
    }
  }

  return total
}

describe('fish traits', () => {
  it('treats an empty trait list as neutral', () => {
    expect(combineTraitModifiers([])).toEqual(NO_TRAIT_MODIFIERS)
  })

  it('multiplies the effects of several traits', () => {
    const combined = combineTraitModifiers(['aggressive', 'strong_runner'])

    expect(combined.runChanceMultiplier).toBeCloseTo(
      TRAIT_MODIFIERS.aggressive.runChanceMultiplier *
        TRAIT_MODIFIERS.strong_runner.runChanceMultiplier,
      10,
    )
    expect(combined.speedMultiplier).toBeCloseTo(
      TRAIT_MODIFIERS.aggressive.speedMultiplier * TRAIT_MODIFIERS.strong_runner.speedMultiplier,
      10,
    )
  })

  it('keeps scarred as an identity-only trait', () => {
    expect(combineTraitModifiers(['scarred'])).toEqual(NO_TRAIT_MODIFIERS)
  })

  it('awards trophy from the size percentile, not from randomness', () => {
    const big = resolveTraits(context({ percentile: 99.5 }), new SeededRandomSource('trophy'))
    const ordinary = resolveTraits(context({ percentile: 98.9 }), new SeededRandomSource('trophy'))

    expect(big).toContain('trophy')
    expect(ordinary).not.toContain('trophy')
  })

  it('awards heavy from the weight ratio', () => {
    const heavy = resolveTraits(context({ weightRatio: 1.12 }), new SeededRandomSource('heavy'))
    const standard = resolveTraits(context({ weightRatio: 1 }), new SeededRandomSource('heavy'))

    expect(heavy).toContain('heavy')
    expect(standard).not.toContain('heavy')
  })

  it('consumes exactly four random draws whatever the outcome', () => {
    for (const overrides of [
      { percentile: 99.9, weightRatio: 1.2 },
      { percentile: 1, weightRatio: 0.9 },
    ]) {
      const counter = countingRandom('draws')
      resolveTraits(context(overrides), counter.random)
      expect(counter.draws()).toBe(4)
    }
  })

  it('is reproducible for the same seed', () => {
    expect(resolveTraits(context(), new SeededRandomSource('same'))).toEqual(
      resolveTraits(context(), new SeededRandomSource('same')),
    )
  })

  it('only returns documented traits', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const trait of resolveTraits(
        context({ percentile: 99.5, weightRatio: 1.2 }),
        new SeededRandomSource(seed),
      )) {
        expect(FISH_TRAITS).toContain(trait)
      }
    }
  })

  it('produces old individuals more often at large sizes', () => {
    expect(countTrait('old', { percentile: 99 })).toBeGreaterThan(
      countTrait('old', { percentile: 5 }),
    )
  })

  it('produces strong runners more often in fast species', () => {
    expect(countTrait('strong_runner', { speciesSpeed: 1 })).toBeGreaterThan(
      countTrait('strong_runner', { speciesSpeed: 0 }),
    )
  })

  it('lets a species override part of the configuration', () => {
    const resolved = resolveTraitConfiguration({ strongRunnerChance: 0.9 })

    expect(resolved.strongRunnerChance).toBe(0.9)
    expect(resolved.oldChance).toBe(DEFAULT_TRAIT_CONFIGURATION.oldChance)
    expect(resolved.trophyPercentileThreshold).toBe(
      DEFAULT_TRAIT_CONFIGURATION.trophyPercentileThreshold,
    )
  })
})
