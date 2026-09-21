import { describe, expect, it } from 'vitest'
import { emptyCodexState } from '../codex'
import { generateFishIndividual } from '../fish/generateFishIndividual'
import { createInitialProgression, DEFAULT_PROGRESSION_TUNING } from '../progression'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { resolveCatch } from './resolveCatch'

const species = createTestSpecies()

/** Domain のテストは DOM / Node のグローバルを使わない（tsconfig.domain.json の制約）。 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const individual = (seed: string) =>
  generateFishIndividual({
    species,
    random: new SeededRandomSource(seed),
    individualSeed: `test-species#${seed}`,
  }).individual

const catchOnce = (options: {
  readonly codex?: ReturnType<typeof emptyCodexState>
  readonly progression?: ReturnType<typeof createInitialProgression>
  readonly seed: string
  readonly spotId?: string
}) =>
  resolveCatch({
    individual: individual(options.seed),
    species,
    codex: options.codex ?? emptyCodexState(),
    progression: options.progression ?? createInitialProgression(),
    capturedAt: '2026-01-01T00:00:00.000Z',
    ...(options.spotId === undefined ? {} : { spotId: options.spotId }),
  })

describe('resolveCatch', () => {
  it('records the catch and awards xp', () => {
    const resolution = catchOnce({ seed: 'first', spotId: 'test-spot' })

    expect(resolution.codex.species['test-species']?.catchCount).toBe(1)
    expect(resolution.progression.totalXp).toBeGreaterThan(0)
    expect(resolution.xp.total).toBe(resolution.progression.totalXp)
    expect(resolution.record.isFirstCatchOfSpecies).toBe(true)
    expect(resolution.xp.factors.map((factor) => factor.label)).toContain('first catch')
  })

  it('orders the flow so discovery bonuses come from the record outcome', () => {
    const first = catchOnce({ seed: 'order', spotId: 'test-spot' })
    const second = catchOnce({
      seed: 'order-2',
      spotId: 'test-spot',
      codex: first.codex,
      progression: first.progression,
    })

    // 2 匹目は初捕獲ボーナスも新 Spot ボーナスも無い。
    expect(second.record.isFirstCatchOfSpecies).toBe(false)
    expect(second.xp.factors.map((factor) => factor.label)).not.toContain('first catch')
    expect(second.xp.factors.map((factor) => factor.label)).not.toContain('new spot')
  })

  it('awards a new spot bonus once per spot', () => {
    const first = catchOnce({ seed: 'spot-a', spotId: 'spot-a' })
    const other = catchOnce({
      seed: 'spot-b',
      spotId: 'spot-b',
      codex: first.codex,
      progression: first.progression,
    })

    expect(other.xp.factors.map((factor) => factor.label)).toContain('new spot')
    expect(other.progression.repetition.spots['spot-b']).toBe(1)
  })

  it('decays repeated catches of the same species', () => {
    let codex = emptyCodexState()
    let progression = createInitialProgression()
    const xpByIndex: number[] = []

    for (let index = 0; index < 12; index += 1) {
      const resolution = resolveCatch({
        individual: individual(`repeat-${String(index)}`),
        species,
        codex,
        progression,
        spotId: 'test-spot',
      })

      codex = resolution.codex
      progression = resolution.progression
      xpByIndex.push(resolution.xp.total)
    }

    expect(progression.repetition.species['test-species']).toBe(12)
    // 減衰が入るので、後半の 1 匹は前半より明らかに少ない。
    const first = xpByIndex[0] ?? 0
    const last = xpByIndex[11] ?? 0

    expect(last).toBeLessThan(first)
  })

  it('levels up and grants skill points', () => {
    let codex = emptyCodexState()
    let progression = createInitialProgression()
    let gainedPoints = 0

    for (let index = 0; index < 60; index += 1) {
      const resolution = resolveCatch({
        individual: individual(`level-${String(index)}`),
        species,
        codex,
        progression,
        spotId: 'test-spot',
      })

      codex = resolution.codex
      progression = resolution.progression
      gainedPoints += resolution.progressionUpdate.skillPointsGained
    }

    expect(progression.anglerLevel).toBeGreaterThan(1)
    expect(progression.skillPoints).toBe(gainedPoints)
    expect(gainedPoints).toBeGreaterThan(0)
    expect(progression.anglerLevel).toBeLessThanOrEqual(DEFAULT_PROGRESSION_TUNING.maxLevel)
  })

  it('does not mutate the inputs', () => {
    const codex = emptyCodexState()
    const progression = createInitialProgression()
    const codexSnapshot = clone(codex)
    const progressionSnapshot = clone(progression)

    catchOnce({ seed: 'immutable', codex, progression, spotId: 'test-spot' })

    expect(codex).toEqual(codexSnapshot)
    expect(progression).toEqual(progressionSnapshot)
  })

  it('is deterministic for the same input', () => {
    const first = catchOnce({ seed: 'deterministic', spotId: 'test-spot' })
    const second = catchOnce({ seed: 'deterministic', spotId: 'test-spot' })

    expect(first.xp).toEqual(second.xp)
    expect(first.codex).toEqual(second.codex)
    expect(first.progression).toEqual(second.progression)
  })
})
