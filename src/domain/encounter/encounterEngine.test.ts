import { describe, expect, it } from 'vitest'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { DEFAULT_FISHING_TUNING } from '../fishing/FishingTuning'
import { biteChance, rollEncounter, type EncounterCandidate } from './encounterEngine'

const species = createTestSpecies()
const candidate = (presence: number): EncounterCandidate => ({ species, presence })

const roll = (presence: number, seed: number | string) =>
  rollEncounter({
    candidates: [candidate(presence)],
    random: new SeededRandomSource(seed),
    tuning: DEFAULT_FISHING_TUNING,
  })

describe('encounter engine', () => {
  it('derives a saturating bite chance from presence', () => {
    expect(biteChance([candidate(1)], DEFAULT_FISHING_TUNING)).toBeCloseTo(
      1 - Math.exp(-0.85),
      5,
    )
    expect(biteChance([candidate(0.5)], DEFAULT_FISHING_TUNING)).toBeCloseTo(
      1 - Math.exp(-0.425),
      5,
    )
    expect(biteChance([candidate(2)], DEFAULT_FISHING_TUNING)).toBeCloseTo(
      1 - Math.exp(-1.7),
      5,
    )
  })

  it('does not make a common neutral fish an almost automatic bite', () => {
    const chance = biteChance([candidate(0.8)], DEFAULT_FISHING_TUNING)

    expect(chance).toBeGreaterThan(0.4)
    expect(chance).toBeLessThan(0.55)
  })

  it('never bites when presence is zero', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(roll(0, seed).kind).toBe('no_bite')
    }
  })

  it('keeps high presence strongly favorable without making it guaranteed', () => {
    const chance = biteChance([candidate(2)], DEFAULT_FISHING_TUNING)

    expect(chance).toBeGreaterThan(0.8)
    expect(chance).toBeLessThan(1)
  })

  it('is reproducible for the same seed', () => {
    expect(roll(1, 'same')).toEqual(roll(1, 'same'))
  })

  it('is empty-handed with no candidates', () => {
    const outcome = rollEncounter({
      candidates: [],
      random: new SeededRandomSource(1),
      tuning: DEFAULT_FISHING_TUNING,
    })

    expect(outcome).toEqual({ kind: 'no_bite' })
  })

  it('prefers the species with the stronger presence', () => {
    const weak: EncounterCandidate = { species, presence: 1 }
    const strong: EncounterCandidate = {
      species: createTestSpecies({ id: species.id, japaneseName: 'テスト魚（強）' }),
      presence: 4,
    }

    let strongCount = 0

    for (let seed = 0; seed < 200; seed += 1) {
      const outcome = rollEncounter({
        candidates: [weak, strong],
        random: new SeededRandomSource(seed),
        tuning: DEFAULT_FISHING_TUNING,
      })

      if (outcome.kind === 'bite' && outcome.candidate === strong) {
        strongCount += 1
      }
    }

    expect(strongCount).toBeGreaterThan(100)
  })
})
