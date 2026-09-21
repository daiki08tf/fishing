import { describe, expect, it } from 'vitest'
import type { RandomSource } from '../rng/RandomSource'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { lengthPercentile, sampleLengthCm, type LengthDistribution } from './lengthModel'

const normalModel: LengthDistribution = {
  kind: 'normal',
  meanCm: 25,
  standardDeviationCm: 3,
  minCm: 12,
  maxCm: 40,
}

const logNormalModel: LengthDistribution = {
  kind: 'lognormal',
  medianCm: 26,
  dispersion: 0.12,
  minCm: 10,
  maxCm: 38,
}

/** 乱数の消費回数を数えるためのラッパ。 */
const countingRandom = (): { readonly random: RandomSource; readonly draws: () => number } => {
  const inner = new SeededRandomSource('counting')
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

const sample = (model: LengthDistribution, seed: string, count: number): readonly number[] => {
  const random = new SeededRandomSource(seed)
  return Array.from({ length: count }, () => sampleLengthCm(model, random))
}

describe('length model', () => {
  it('keeps every sample inside the model bounds', () => {
    for (const model of [normalModel, logNormalModel]) {
      for (const value of sample(model, 'bounds', 2000)) {
        expect(value).toBeGreaterThanOrEqual(model.minCm)
        expect(value).toBeLessThanOrEqual(model.maxCm)
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('is reproducible for the same seed', () => {
    expect(sample(logNormalModel, 'same', 50)).toEqual(sample(logNormalModel, 'same', 50))
  })

  it('consumes exactly two random draws', () => {
    for (const model of [normalModel, logNormalModel]) {
      const counter = countingRandom()
      sampleLengthCm(model, counter.random)
      expect(counter.draws()).toBe(2)
    }
  })

  it('does not behave like a uniform distribution', () => {
    const values = sample(logNormalModel, 'distribution', 10000)
    const belowMedian = values.filter((value) => value <= 26).length
    const aboveSeventyFifth = values.filter((value) => value > 26 * Math.exp(0.12 * 0.6745)).length

    // 一様分布ならどちらも 25〜50% になる。中央値付近に集まることを確認する。
    expect(belowMedian).toBeGreaterThan(4000)
    expect(belowMedian).toBeLessThan(6000)
    expect(aboveSeventyFifth).toBeLessThan(3500)
  })

  it('makes large individuals rarer than ordinary ones', () => {
    const values = sample(logNormalModel, 'tail', 10000)
    const p90 = 26 * Math.exp(0.12 * 1.2816)
    const p99 = 26 * Math.exp(0.12 * 2.3263)

    const common = values.filter((value) => value <= 26).length
    const upper = values.filter((value) => value > p90).length
    const rare = values.filter((value) => value > p99).length

    expect(common).toBeGreaterThan(upper)
    expect(upper).toBeGreaterThan(rare)
  })

  it('computes percentiles that grow with length', () => {
    const small = lengthPercentile(normalModel, 20)
    const middle = lengthPercentile(normalModel, 25)
    const large = lengthPercentile(normalModel, 31)

    expect(small).toBeLessThan(middle)
    expect(middle).toBeLessThan(large)
    expect(middle).toBeCloseTo(50, 0)
    expect(small).toBeGreaterThanOrEqual(0)
    expect(large).toBeLessThanOrEqual(100)
  })

  it('reports the documented percentile for the log-normal model', () => {
    expect(lengthPercentile(logNormalModel, 26)).toBeCloseTo(50, 1)

    const p99 = 26 * Math.exp(0.12 * 2.3263)
    expect(lengthPercentile(logNormalModel, p99)).toBeCloseTo(99, 0)
  })

  it('stays inside 0..100 even outside the distribution', () => {
    expect(lengthPercentile(normalModel, 1)).toBeGreaterThanOrEqual(0)
    expect(lengthPercentile(normalModel, 200)).toBeLessThanOrEqual(100)
  })
})
