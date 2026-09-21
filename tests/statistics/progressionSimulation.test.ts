import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { resolveCatch } from '../../src/domain/catch'
import { emptyCodexState, type CodexState } from '../../src/domain/codex'
import { generateFishIndividual } from '../../src/domain/fish/generateFishIndividual'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import type { FishSpecies } from '../../src/domain/fish/FishSpecies'
import {
  createInitialProgression,
  DEFAULT_PROGRESSION_TUNING,
  totalXpForLevel,
  type AnglerProgression,
} from '../../src/domain/progression'
import { SeededRandomSource } from '../../src/domain/rng/SeededRandomSource'

/**
 * 成長ループの統計的検証。
 *
 * 多数の釣果を流して、XP の破綻がないこと・反復が損であること・
 * Lv100 が上限として機能することを決定論的に確認する。
 */

const content = loadContentFromDirectory()
const spotId = String(content.primarySpot.id)
const CATCHES = 500

type RunResult = {
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly totalXp: number
  readonly firstCatchXp: number
  readonly lastCatchXp: number
}

const run = (options: {
  readonly species: readonly FishSpecies[]
  readonly catches: number
  readonly seed: string
}): RunResult => {
  const random = new SeededRandomSource(options.seed)
  let codex = emptyCodexState()
  let progression = createInitialProgression()
  let totalXp = 0
  let firstCatchXp = 0
  let lastCatchXp = 0

  for (let index = 0; index < options.catches; index += 1) {
    const species = options.species[index % options.species.length]

    if (species === undefined) {
      throw new Error('no species')
    }

    const generated = generateFishIndividual({
      species,
      random,
      individualSeed: `${String(species.id)}#${String(index)}`,
    })

    const resolution = resolveCatch({
      individual: generated.individual,
      species,
      codex,
      progression,
      spotId,
    })

    codex = resolution.codex
    progression = resolution.progression
    totalXp += resolution.xp.total
    lastCatchXp = resolution.xp.total

    if (index === 0) {
      firstCatchXp = resolution.xp.total
    }
  }

  return { progression, codex, totalXp, firstCatchXp, lastCatchXp }
}

describe('progression simulation', () => {
  const primary = content.species[0]

  it('has species to fish for', () => {
    expect(primary).toBeDefined()
    expect(content.species.length).toBeGreaterThanOrEqual(10)
  })

  it('produces finite, positive xp with no NaN', () => {
    const farming = run({ species: [primary as FishSpecies], catches: CATCHES, seed: 'stats' })

    expect(Number.isFinite(farming.totalXp)).toBe(true)
    expect(farming.totalXp).toBeGreaterThan(0)
    expect(Number.isFinite(farming.progression.totalXp)).toBe(true)
    expect(farming.progression.totalXp).toBe(farming.totalXp)
    expect(farming.progression.anglerLevel).toBeGreaterThan(1)
  })

  it('makes repeated common catches worth much less', () => {
    const farming = run({ species: [primary as FishSpecies], catches: CATCHES, seed: 'decay' })

    expect(farming.lastCatchXp).toBeLessThan(farming.firstCatchXp / 2)
  })

  it('rewards variety more than farming one species', () => {
    const farming = run({ species: [primary as FishSpecies], catches: CATCHES, seed: 'variety' })
    const mixed = run({ species: content.species, catches: CATCHES, seed: 'variety' })

    expect(mixed.totalXp).toBeGreaterThan(farming.totalXp)
    expect(mixed.progression.anglerLevel).toBeGreaterThanOrEqual(farming.progression.anglerLevel)
  })

  it('gives skill points for every level gained', () => {
    const mixed = run({ species: content.species, catches: CATCHES, seed: 'points' })

    expect(mixed.progression.skillPoints).toBeGreaterThan(0)
    expect(mixed.progression.anglerLevel - 1).toBeGreaterThan(0)
  })

  it('is deterministic for the same seed', () => {
    const first = run({ species: content.species, catches: 100, seed: 'repeat' })
    const second = run({ species: content.species, catches: 100, seed: 'repeat' })

    expect(first.totalXp).toBe(second.totalXp)
    expect(first.progression).toEqual(second.progression)
    expect(first.codex).toEqual(second.codex)
  })

  it('reaches level 100 with the cumulative requirement and then stops', () => {
    const codex = emptyCodexState()
    const species = primary as FishSpecies
    const random = new SeededRandomSource('max-level')
    let progression = createInitialProgression()

    // 上限に必要な XP を、大きな 1 匹で一気に超えさせる。
    const generated = generateFishIndividual({
      species,
      random,
      individualSeed: 'max-level#0',
    })

    const huge: FishIndividual = {
      ...generated.individual,
      percentile: 99.99,
      traits: ['trophy'],
    }

    // 1 匹で Lv100 相当の XP を与えるため、Base XP と上限を一時的に上げる。
    const hugeBase = totalXpForLevel(DEFAULT_PROGRESSION_TUNING.maxLevel) + 1000
    const resolution = resolveCatch({
      individual: huge,
      species,
      codex,
      progression,
      spotId,
      tuning: {
        ...DEFAULT_PROGRESSION_TUNING,
        baseCatchXp: hugeBase,
        maxCatchXp: hugeBase * 20,
      },
    })

    progression = resolution.progression

    expect(progression.anglerLevel).toBe(DEFAULT_PROGRESSION_TUNING.maxLevel)
    expect(progression.anglerXp).toBe(0)

    // さらに釣ってもレベルは増えず、XP も溜まらない。
    const again = resolveCatch({
      individual: generated.individual,
      species,
      codex: resolution.codex,
      progression,
      spotId,
    })

    expect(again.progression.anglerLevel).toBe(DEFAULT_PROGRESSION_TUNING.maxLevel)
    expect(again.progression.anglerXp).toBe(0)
  })
})
