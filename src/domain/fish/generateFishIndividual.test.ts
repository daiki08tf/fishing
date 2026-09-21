import { describe, expect, it } from 'vitest'
import { asFishingSpotId } from '../ids'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { FISH_TRAITS } from './FishTrait'
import { conditionBand } from './fishCondition'
import { combineTraitModifiers } from './fishTraits'
import { generateFishIndividual } from './generateFishIndividual'
import { estimateStandardWeightKg } from './weightModel'

const species = createTestSpecies()

const generate = (seed: string) =>
  generateFishIndividual({
    species,
    random: new SeededRandomSource(seed),
    individualSeed: `test-species#${seed}`,
  })

describe('generateFishIndividual', () => {
  it('is reproducible for the same seed', () => {
    expect(generate('alpha')).toEqual(generate('alpha'))
  })

  it('uses the individual seed as the identity', () => {
    const generated = generate('alpha')

    expect(String(generated.individual.id)).toBe('test-species#alpha')
    expect(generated.individual.fightSeed).toBe('test-species#alpha')
    expect(generated.individual.speciesId).toBe(species.id)
  })

  it('produces different individuals for different seeds', () => {
    const lengths = new Set<number>()

    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      lengths.add(generate(seed).individual.lengthCm)
    }

    expect(lengths.size).toBeGreaterThan(1)
  })

  it('keeps every value inside its documented range', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const { individual } = generate(`bounds-${String(seed)}`)

      expect(individual.lengthCm).toBeGreaterThanOrEqual(species.lengthModel.minCm)
      expect(individual.lengthCm).toBeLessThanOrEqual(species.lengthModel.maxCm)
      expect(individual.weightKg).toBeGreaterThan(0)
      expect(individual.condition).toBeGreaterThanOrEqual(0)
      expect(individual.condition).toBeLessThanOrEqual(1)
      expect(individual.percentile).toBeGreaterThanOrEqual(0)
      expect(individual.percentile).toBeLessThanOrEqual(100)
      expect(Number.isFinite(individual.weightKg)).toBe(true)
    }
  })

  it('derives the weight from the length instead of sampling it independently', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { individual } = generate(`weight-${String(seed)}`)
      const standard = estimateStandardWeightKg(species.weightModel, individual.lengthCm)
      const ratio = individual.weightKg / standard

      // コンディション由来の ±15% に丸め誤差を足した範囲に収まる。
      expect(ratio).toBeGreaterThan(0.75)
      expect(ratio).toBeLessThan(1.25)
    }
  })

  it('reports the condition band that matches the condition value', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const generated = generate(`condition-${String(seed)}`)

      expect(generated.conditionBand).toBe(conditionBand(generated.individual.condition))
    }
  })

  it('only assigns documented traits and consistent modifiers', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const generated = generate(`traits-${String(seed)}`)

      for (const trait of generated.individual.traits) {
        expect(FISH_TRAITS).toContain(trait)
      }

      expect(generated.traitModifiers).toEqual(combineTraitModifiers(generated.individual.traits))
    }
  })

  it('ties the trophy trait to a rare size', () => {
    let trophies = 0

    for (let seed = 0; seed < 2000; seed += 1) {
      const { individual } = generate(`trophy-${String(seed)}`)

      if (individual.traits.includes('trophy')) {
        trophies += 1
        expect(individual.percentile).toBeGreaterThanOrEqual(99)
      }
    }

    // 上限 1% の設定なので、2000 匹で 40 匹を超えることはない。
    expect(trophies).toBeLessThan(40)
  })

  it('carries the capture context when it is provided', () => {
    const generated = generateFishIndividual({
      species,
      random: new SeededRandomSource('context'),
      individualSeed: 'test-species#context',
      spotId: asFishingSpotId('test-spot'),
      capturedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(generated.individual.spotId).toBe('test-spot')
    expect(generated.individual.capturedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('computes a weight ratio that matches the condition factor', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const generated = generate(`ratio-${String(seed)}`)

      expect(generated.weightRatio).toBeGreaterThan(0.75)
      expect(generated.weightRatio).toBeLessThan(1.25)
    }
  })
})
