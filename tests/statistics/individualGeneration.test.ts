import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { FISH_TRAITS } from '../../src/domain/fish/FishTrait'
import { generateFishIndividual } from '../../src/domain/fish/generateFishIndividual'
import { lengthModelMedian } from '../../src/domain/fish/lengthModel'
import { estimateStandardWeightKg } from '../../src/domain/fish/weightModel'
import { SeededRandomSource } from '../../src/domain/rng/SeededRandomSource'

/**
 * 個体生成の統計的 sanity check。
 *
 * 10,000 個体を生成して破綻がないかを見る。乱数は seed 固定なので、
 * このテストは常に同じ結果になり flaky にはならない。
 */

const SAMPLES = 10000
const content = loadContentFromDirectory()

type Aggregates = {
  readonly invalid: number
  readonly minLength: number
  readonly maxLength: number
  readonly meanLength: number
  readonly minWeight: number
  readonly maxWeight: number
  readonly minPercentile: number
  readonly maxPercentile: number
  readonly minWeightRatio: number
  readonly maxWeightRatio: number
  readonly minDensity: number
  readonly maxDensity: number
  readonly trophies: number
  readonly buckets: readonly [number, number, number, number]
  readonly traits: ReadonlySet<string>
}

const aggregate = (speciesIndex: number): Aggregates => {
  const species = content.species[speciesIndex]

  if (species === undefined) {
    throw new Error(`no species at index ${String(speciesIndex)}`)
  }

  const random = new SeededRandomSource(`statistics#${String(species.id)}`)
  const median = lengthModelMedian(species.lengthModel)

  let invalid = 0
  let minLength = Number.POSITIVE_INFINITY
  let maxLength = Number.NEGATIVE_INFINITY
  let sumLength = 0
  let minWeight = Number.POSITIVE_INFINITY
  let maxWeight = Number.NEGATIVE_INFINITY
  let minPercentile = Number.POSITIVE_INFINITY
  let maxPercentile = Number.NEGATIVE_INFINITY
  let minWeightRatio = Number.POSITIVE_INFINITY
  let maxWeightRatio = Number.NEGATIVE_INFINITY
  let minDensity = Number.POSITIVE_INFINITY
  let maxDensity = Number.NEGATIVE_INFINITY
  let trophies = 0
  const buckets: [number, number, number, number] = [0, 0, 0, 0]
  const traits = new Set<string>()

  for (let index = 0; index < SAMPLES; index += 1) {
    const { individual } = generateFishIndividual({
      species,
      random,
      individualSeed: `${String(species.id)}#${String(index)}`,
    })
    const percentile = individual.percentile ?? 0
    const ratio =
      individual.weightKg / estimateStandardWeightKg(species.weightModel, individual.lengthCm)

    if (
      !Number.isFinite(individual.lengthCm) ||
      !Number.isFinite(individual.weightKg) ||
      !Number.isFinite(individual.condition) ||
      individual.lengthCm < species.lengthModel.minCm ||
      individual.lengthCm > species.lengthModel.maxCm ||
      individual.weightKg <= 0 ||
      individual.condition < 0 ||
      individual.condition > 1 ||
      percentile < 0 ||
      percentile > 100
    ) {
      invalid += 1
    }

    minLength = Math.min(minLength, individual.lengthCm)
    maxLength = Math.max(maxLength, individual.lengthCm)
    sumLength += individual.lengthCm
    minWeight = Math.min(minWeight, individual.weightKg)
    maxWeight = Math.max(maxWeight, individual.weightKg)
    minPercentile = Math.min(minPercentile, percentile)
    maxPercentile = Math.max(maxPercentile, percentile)
    minWeightRatio = Math.min(minWeightRatio, ratio)
    maxWeightRatio = Math.max(maxWeightRatio, ratio)

    // 絶対的な妥当性: 体重 / 体長^3 が現実的な範囲か（単位の取り違え検出）。
    const density = individual.weightKg / individual.lengthCm ** 3
    minDensity = Math.min(minDensity, density)
    maxDensity = Math.max(maxDensity, density)

    for (const trait of individual.traits) {
      traits.add(trait)
    }

    if (individual.traits.includes('trophy')) {
      trophies += 1
    }

    if (individual.lengthCm <= median) {
      buckets[0] += 1
    } else if (percentile < 90) {
      buckets[1] += 1
    } else if (percentile < 99) {
      buckets[2] += 1
    } else {
      buckets[3] += 1
    }
  }

  return {
    invalid,
    minLength,
    maxLength,
    meanLength: sumLength / SAMPLES,
    minWeight,
    maxWeight,
    minPercentile,
    maxPercentile,
    minWeightRatio,
    maxWeightRatio,
    minDensity,
    maxDensity,
    trophies,
    buckets,
    traits,
  }
}

describe('individual generation statistics', () => {
  it('ships at least ten species to sample from', () => {
    expect(content.species.length).toBeGreaterThanOrEqual(10)
  })

  it('produces sane individuals for every species', () => {
    for (let index = 0; index < content.species.length; index += 1) {
      const species = content.species[index]
      const stats = aggregate(index)

      expect(stats.invalid, `${String(species?.id)} produced invalid individuals`).toBe(0)
      expect(stats.minLength).toBeGreaterThanOrEqual(species?.lengthModel.minCm ?? 0)
      expect(stats.maxLength).toBeLessThanOrEqual(species?.lengthModel.maxCm ?? 0)
      expect(stats.minPercentile).toBeGreaterThanOrEqual(0)
      expect(stats.maxPercentile).toBeLessThanOrEqual(100)
      expect(stats.minWeight).toBeGreaterThan(0)
      // 体重は体長から導出されている（独立な乱数ではない）。
      // 丸め誤差を含むため、体格差の設計値（0.85〜1.15）より少し広く取る。
      expect(stats.minWeightRatio).toBeGreaterThan(0.75)
      expect(stats.maxWeightRatio).toBeLessThan(1.25)
      // 20cm の魚が 90kg になるような単位の取り違えを検出する。
      expect(stats.minDensity, `${String(species?.id)} is implausibly light`).toBeGreaterThan(1e-6)
      expect(stats.maxDensity, `${String(species?.id)} is implausibly heavy`).toBeLessThan(1e-4)
    }
  })

  it('makes large individuals rarer than ordinary ones', () => {
    for (let index = 0; index < content.species.length; index += 1) {
      const [common, p50to90, p90to99, aboveP99] = aggregate(index).buckets

      expect(common).toBeGreaterThan(p50to90)
      expect(p50to90).toBeGreaterThan(p90to99)
      expect(p90to99).toBeGreaterThan(aboveP99)
    }
  })

  it('keeps the trophy rate inside the intended range', () => {
    for (let index = 0; index < content.species.length; index += 1) {
      const stats = aggregate(index)
      const rate = stats.trophies / SAMPLES

      // 設定は「上位 1%」前後（魚種ごとに 0.6〜1%）。
      expect(rate).toBeLessThan(0.03)
      expect(rate).toBeGreaterThan(0.001)
    }
  })

  it('produces every documented trait at least somewhere', () => {
    const seen = new Set<string>()

    for (let index = 0; index < content.species.length; index += 1) {
      for (const trait of aggregate(index).traits) {
        seen.add(trait)
      }
    }

    for (const trait of FISH_TRAITS) {
      expect(seen).toContain(trait)
    }
  })

  it('is deterministic for the same seed', () => {
    expect(aggregate(0)).toEqual(aggregate(0))
  })
})
