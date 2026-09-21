import { describe, expect, it } from 'vitest'
import { combineTraitModifiers, NO_TRAIT_MODIFIERS } from '../fish/fishTraits'
import { generateFishIndividual } from '../fish/generateFishIndividual'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { createFightingFish } from './createFightingFish'
import { DEFAULT_FISHING_TUNING } from './FishingTuning'

const createFish = (seed: string, traitSeed?: string) => {
  const species = createTestSpecies()
  const random = new SeededRandomSource(seed)
  const generated = generateFishIndividual({
    species,
    random,
    individualSeed: `test-species#${seed}`,
  })

  return {
    generated,
    fight: createFightingFish({
      species,
      individual: generated.individual,
      traitModifiers: generated.traitModifiers,
      random: new SeededRandomSource(traitSeed ?? `${seed}#fight`),
    }),
  }
}

describe('createFightingFish', () => {
  it('carries the generated individual', () => {
    const { generated, fight } = createFish('alpha')

    expect(fight.individual).toEqual(generated.individual)
    expect(fight.speciesName).toBe('テスト魚')
  })

  it('derives the fight characteristics from the species profile', () => {
    const species = createTestSpecies()
    const generated = generateFishIndividual({
      species,
      random: new SeededRandomSource('profile'),
      individualSeed: 'test-species#profile',
    })
    // Trait の倍率を外した状態で、種プロファイル ±個体差を確認する。
    const fight = createFightingFish({
      species,
      individual: generated.individual,
      traitModifiers: NO_TRAIT_MODIFIERS,
      random: new SeededRandomSource('profile#fight'),
    })
    const variance = DEFAULT_FISHING_TUNING.individualVariance

    // 種プロファイル ±個体差の範囲に収まる。
    expect(fight.power).toBeGreaterThanOrEqual(0.5 * (1 - variance))
    expect(fight.power).toBeLessThanOrEqual(0.5 * (1 + variance))
    expect(fight.speed).toBeGreaterThanOrEqual(0)
    expect(fight.speed).toBeLessThanOrEqual(1)
    expect(fight.staminaMax).toBeGreaterThanOrEqual(0.05)
    expect(fight.staminaMax).toBeLessThanOrEqual(1)
  })

  it('is reproducible for the same seeds', () => {
    expect(createFish('beta').fight).toEqual(createFish('beta').fight)
  })

  it('applies trait modifiers to the fight characteristics', () => {
    const species = createTestSpecies({ fightProfile: { strength: 0.5, stamina: 0.5, speed: 0.5 } })
    const random = new SeededRandomSource('modifiers')
    const generated = generateFishIndividual({
      species,
      random,
      individualSeed: 'test-species#modifiers',
    })

    const plain = createFightingFish({
      species,
      individual: generated.individual,
      traitModifiers: NO_TRAIT_MODIFIERS,
      random: new SeededRandomSource('fight-seed'),
    })
    const boosted = createFightingFish({
      species,
      individual: generated.individual,
      traitModifiers: combineTraitModifiers(['trophy']),
      random: new SeededRandomSource('fight-seed'),
    })

    expect(boosted.staminaMax).toBeGreaterThan(plain.staminaMax)
    expect(boosted.power).toBeGreaterThan(plain.power)
    expect(boosted.modifiers.staminaMultiplier).toBeGreaterThan(1)
  })

  it('never exceeds the 0..1 range even with strong modifiers', () => {
    const species = createTestSpecies({
      fightProfile: { strength: 1, stamina: 1, speed: 1 },
    })
    const generated = generateFishIndividual({
      species,
      random: new SeededRandomSource('clamp'),
      individualSeed: 'test-species#clamp',
    })

    for (let index = 0; index < 200; index += 1) {
      const fight = createFightingFish({
        species,
        individual: generated.individual,
        traitModifiers: combineTraitModifiers(['trophy', 'aggressive', 'strong_runner']),
        random: new SeededRandomSource(index),
      })

      expect(fight.power).toBeLessThanOrEqual(1)
      expect(fight.speed).toBeLessThanOrEqual(1)
      expect(fight.staminaMax).toBeLessThanOrEqual(1)
      expect(fight.power).toBeGreaterThanOrEqual(0)
    }
  })
})
