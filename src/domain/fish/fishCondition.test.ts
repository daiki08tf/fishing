import { describe, expect, it } from 'vitest'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import {
  conditionBand,
  conditionWeightFactor,
  DEFAULT_CONDITION_MODEL,
  sampleCondition,
} from './fishCondition'

const sample = (seed: string, count: number, variability = 0.5): readonly number[] => {
  const random = new SeededRandomSource(seed)
  return Array.from({ length: count }, () => sampleCondition(random, { variability }))
}

const variance = (values: readonly number[]): number => {
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
}

describe('fish condition', () => {
  it('stays inside 0..1', () => {
    for (const value of sample('bounds', 2000)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('is centered on the standard value', () => {
    const values = sample('center', 4000)
    const mean = values.reduce((total, value) => total + value, 0) / values.length

    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
  })

  it('is reproducible for the same seed', () => {
    expect(sample('same', 20)).toEqual(sample('same', 20))
  })

  it('widens the spread with a larger variability', () => {
    expect(variance(sample('spread', 4000, 0.9))).toBeGreaterThan(
      variance(sample('spread', 4000, 0.1)),
    )
  })

  it('maps the condition to the documented bands', () => {
    expect(conditionBand(0.1)).toBe('thin')
    expect(conditionBand(0.19)).toBe('thin')
    expect(conditionBand(0.2)).toBe('standard')
    expect(conditionBand(0.64)).toBe('standard')
    expect(conditionBand(0.65)).toBe('good')
    expect(conditionBand(0.89)).toBe('good')
    expect(conditionBand(0.9)).toBe('excellent')
    expect(conditionBand(1)).toBe('excellent')
  })

  it('lets the condition change the weight by a small amount', () => {
    expect(conditionWeightFactor(0)).toBeCloseTo(0.85, 5)
    expect(conditionWeightFactor(0.5)).toBeCloseTo(1, 5)
    expect(conditionWeightFactor(1)).toBeCloseTo(1.15, 5)
    expect(conditionWeightFactor(0.2)).toBeLessThan(conditionWeightFactor(0.8))
  })

  it('has a usable default model', () => {
    expect(DEFAULT_CONDITION_MODEL.variability).toBeGreaterThan(0)
    expect(DEFAULT_CONDITION_MODEL.variability).toBeLessThanOrEqual(1)
  })
})
