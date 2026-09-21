import { describe, expect, it } from 'vitest'
import { DEFAULT_FISHING_TUNING } from '../fishing/FishingTuning'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { asFishSpeciesId } from '../ids'
import {
  biteChance,
  encounterWeight,
  rollEncounter,
  speciesAffinity,
  type EncounterCandidate,
  type EncounterProfile,
} from './encounterEngine'

/**
 * 釣法と offering が Encounter の重みを変えること（Phase 6）。
 *
 * 「特定のルアーでないと釣れない」ではなく、相性の良し悪しだけを扱う。
 */

const species = createTestSpecies({
  methodAffinity: { lure: 1.3, bait: 0.7 },
  offeringAffinity: { minnow: 1.2, jig: 0.8, small: 1.5 },
})

const profile = (overrides: Partial<EncounterProfile> = {}): EncounterProfile => ({
  methodId: 'lure',
  offeringTags: [],
  biteAffinity: 1,
  ...overrides,
})

describe('speciesAffinity', () => {
  it('is neutral without a profile', () => {
    expect(speciesAffinity(species, undefined)).toBe(1)
  })

  it('is neutral for unknown methods and tags', () => {
    expect(speciesAffinity(species, profile({ methodId: 'surf', offeringTags: ['unknown'] }))).toBe(
      1,
    )
  })

  it('multiplies the method and offering affinities', () => {
    // 1.3 (lure) * 1.2 (minnow)
    expect(speciesAffinity(species, profile({ offeringTags: ['minnow'] }))).toBeCloseTo(1.56, 6)
  })

  it('multiplies several offering tags together', () => {
    // 1.3 * 1.2 * 1.5
    expect(speciesAffinity(species, profile({ offeringTags: ['minnow', 'small'] }))).toBeCloseTo(
      2.34,
      6,
    )
  })
})

describe('encounterWeight', () => {
  const candidate: EncounterCandidate = { species, presence: 0.5 }

  it('is the presence when the profile is neutral', () => {
    expect(encounterWeight(candidate, profile({ methodId: 'surf' }))).toBeCloseTo(0.5, 6)
  })

  it('is raised by a good affinity', () => {
    // 0.5 * 1.5 (small)
    expect(
      encounterWeight(candidate, profile({ methodId: 'surf', offeringTags: ['small'] })),
    ).toBeCloseTo(0.75, 6)
  })

  it('never goes negative', () => {
    const hostile = createTestSpecies({
      id: asFishSpeciesId('hostile-species'),
      methodAffinity: { lure: 0 },
    })

    expect(encounterWeight({ species: hostile, presence: 1 }, profile())).toBe(0)
  })
})

describe('biteChance', () => {
  const candidates: readonly EncounterCandidate[] = [{ species, presence: 0.5 }]

  it('scales with the bite affinity', () => {
    const base = biteChance(candidates, DEFAULT_FISHING_TUNING)
    const good = biteChance(candidates, DEFAULT_FISHING_TUNING, profile({ biteAffinity: 1.4 }))
    const bad = biteChance(candidates, DEFAULT_FISHING_TUNING, profile({ biteAffinity: 0.2 }))

    expect(good).toBeGreaterThan(base)
    expect(bad).toBeLessThan(base)
  })

  it('clamps the affinity so a single item cannot dominate', () => {
    const extreme = biteChance(candidates, DEFAULT_FISHING_TUNING, profile({ biteAffinity: 99 }))

    // 0.5 * 0.85 * 1.4 = 0.595
    expect(extreme).toBeCloseTo(0.595, 6)
  })
})

describe('rollEncounter with a profile', () => {
  const weakSpecies = createTestSpecies({
    id: asFishSpeciesId('weak-species'),
    methodAffinity: { lure: 1 },
    offeringAffinity: { minnow: 0.5 },
  })
  const strongSpecies = createTestSpecies({
    id: asFishSpeciesId('strong-species'),
    methodAffinity: { lure: 1 },
    offeringAffinity: { minnow: 1.5 },
  })
  const candidates: readonly EncounterCandidate[] = [
    { species: weakSpecies, presence: 1 },
    { species: strongSpecies, presence: 1 },
  ]

  const count = (p: EncounterProfile | undefined): { weak: number; strong: number } => {
    let weak = 0
    let strong = 0

    for (let seed = 0; seed < 500; seed += 1) {
      const outcome = rollEncounter({
        candidates,
        random: new SeededRandomSource(seed),
        tuning: DEFAULT_FISHING_TUNING,
        ...(p === undefined ? {} : { profile: p }),
      })

      if (outcome.kind !== 'bite') {
        continue
      }

      if (outcome.candidate.species === strongSpecies) {
        strong += 1
      } else {
        weak += 1
      }
    }

    return { weak, strong }
  }

  it('is even-handed without a profile', () => {
    const result = count(undefined)

    expect(Math.abs(result.strong - result.weak)).toBeLessThan(60)
  })

  it('favours the species that matches the minnow tag', () => {
    const neutral = count(undefined)
    const minnow = count(profile({ offeringTags: ['minnow'] }))

    expect(minnow.strong).toBeGreaterThan(neutral.strong)
    expect(minnow.weak).toBeLessThan(neutral.weak)
  })

  it('is reproducible for the same seed and profile', () => {
    const a = rollEncounter({
      candidates,
      random: new SeededRandomSource('same'),
      tuning: DEFAULT_FISHING_TUNING,
      profile: profile({ offeringTags: ['minnow'] }),
    })
    const b = rollEncounter({
      candidates,
      random: new SeededRandomSource('same'),
      tuning: DEFAULT_FISHING_TUNING,
      profile: profile({ offeringTags: ['minnow'] }),
    })

    expect(a).toEqual(b)
  })
})
