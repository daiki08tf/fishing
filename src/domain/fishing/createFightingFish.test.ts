import { describe, expect, it } from 'vitest'
import { asFishSpeciesId } from '../ids'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { createFightingFish } from './createFightingFish'

const createFish = (seed: number | string) =>
  createFightingFish({
    species: createTestSpecies(),
    random: new SeededRandomSource(seed),
    individualSeed: `test-species#${String(seed)}`,
  })

describe('createFightingFish', () => {
  it('is reproducible for the same seed', () => {
    expect(createFish('alpha')).toEqual(createFish('alpha'))
  })

  it('produces different individuals for different seeds', () => {
    const first = createFish('alpha')
    const second = createFish('beta')

    expect(first).not.toEqual(second)
  })

  it('carries the species identity and the individual seed', () => {
    const fish = createFish('alpha')

    expect(fish.speciesId).toBe(asFishSpeciesId('test-species'))
    expect(fish.name).toBe('テスト魚')
    expect(fish.individualSeed).toBe('test-species#alpha')
  })

  it('keeps every generated individual inside the species constraints', () => {
    const species = createTestSpecies()

    for (let seed = 0; seed < 200; seed += 1) {
      const fish = createFightingFish({
        species,
        random: new SeededRandomSource(seed),
        individualSeed: `test-species#${String(seed)}`,
      })

      expect(fish.lengthCm).toBeGreaterThanOrEqual(species.lengthModel.minCm)
      expect(fish.lengthCm).toBeLessThanOrEqual(species.lengthModel.maxCm)
      expect(fish.power).toBeGreaterThanOrEqual(0)
      expect(fish.power).toBeLessThanOrEqual(1)
      expect(fish.speed).toBeGreaterThanOrEqual(0)
      expect(fish.speed).toBeLessThanOrEqual(1)
      expect(fish.staminaMax).toBeGreaterThanOrEqual(0.05)
      expect(fish.staminaMax).toBeLessThanOrEqual(1)
      expect(fish.weightKg).toBeDefined()
    }
  })

  it('uses the length to weight model when it is present', () => {
    const fish = createFish(1)
    const expected = 0.01 * fish.lengthCm ** 3

    expect(fish.weightKg).toBeCloseTo(expected, 2)
  })

  it('omits weight when the species has no weight model', () => {
    const species = createTestSpecies()
    const withoutWeight = { ...species, weightModel: undefined }

    const fish = createFightingFish({
      species: withoutWeight,
      random: new SeededRandomSource(1),
      individualSeed: 'test-species#1',
    })

    expect(fish.weightKg).toBeUndefined()
  })
})
