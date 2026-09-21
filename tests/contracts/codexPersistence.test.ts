import { describe, expect, it } from 'vitest'
import { resolveCatch } from '../../src/domain/catch'
import {
  emptyCodexState,
  recordCatch,
  toRecordEntry,
  type CodexState,
} from '../../src/domain/codex'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import { generateFishIndividual } from '../../src/domain/fish/generateFishIndividual'
import { asFishIndividualId } from '../../src/domain/ids'
import { createInitialProgression, type AnglerProgression } from '../../src/domain/progression'
import { SeededRandomSource } from '../../src/domain/rng/SeededRandomSource'
import type { CurrentSave, SaveGameV4 } from '../../src/domain/save/SaveGame'
import { InMemorySaveRepository } from '../../src/infrastructure/persistence/inMemorySaveRepository'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { createSave } from '../../src/infrastructure/persistence/saveFactory'
import { createValidSaveV1, createValidSaveV4 } from '../fixtures/save'
import { createTestSpecies } from '../fixtures/species'

/**
 * Codex の永続化。
 *
 * Codex を保存しないと、再起動のたびに
 * - First Catch Bonus
 * - Personal Record Bonus
 * を再取得できてしまう（XP の抜け道）。
 * また捕獲数・最大サイズ・最大重量・Trait 履歴も失われる。
 * ここでは保存 → 読み込み → 実際に釣る、までを通して確認する。
 */

const species = createTestSpecies()
const template = createValidSaveV4()

const progressionAt = (level: number): AnglerProgression => ({
  ...createInitialProgression(),
  anglerLevel: level,
})

const saveWith = (codex: CodexState, progression: AnglerProgression): SaveGameV4 =>
  createSave({
    progression,
    codex,
    world: template.world,
    knowledge: template.knowledge,
    finance: template.finance,
    createdAt: '2026-01-01T00:00:00.000Z',
    now: '2026-03-01T00:00:00.000Z',
  })

/** 永続化と再起動を模す（JSON を経由して読み直す）。 */
const saveAndReload = async (save: SaveGameV4): Promise<CurrentSave> => {
  const repository = new InMemorySaveRepository()
  await repository.save(save)

  const raw = await repository.loadRaw()
  const result = migrateSave(JSON.parse(JSON.stringify(raw)) as unknown)

  expect(result.ok).toBe(true)

  if (!result.ok) {
    throw new Error(result.message)
  }

  return result.save
}

const individualWith = (overrides: Partial<FishIndividual> = {}): FishIndividual => ({
  id: asFishIndividualId('test-species#new'),
  speciesId: species.id,
  lengthCm: 25,
  weightKg: 0.25,
  condition: 0.5,
  traits: [],
  fightSeed: 'test-species#new',
  percentile: 50,
  ...overrides,
})

const catchWith = (codex: CodexState, individual: FishIndividual) =>
  resolveCatch({
    individual,
    species,
    codex,
    progression: progressionAt(3),
    spotId: 'test-spot',
  })

const factorLabels = (resolution: ReturnType<typeof catchWith>): readonly string[] =>
  resolution.xp.factors.map((factor) => factor.label)

describe('codex persistence', () => {
  it('round trips the codex through save and load', async () => {
    const codex = emptyCodexState()
    const caught = individualWith({ percentile: 91.5 })
    const recorded = recordCatch(codex, toRecordEntry(caught, '2026-02-01T00:00:00.000Z')).state

    const restored = await saveAndReload(saveWith(recorded, progressionAt(4)))

    expect(restored.codex).toEqual(recorded)
  })

  it('keeps the catch count', async () => {
    let codex = emptyCodexState()

    for (let index = 0; index < 3; index += 1) {
      codex = recordCatch(
        codex,
        toRecordEntry(individualWith({ id: asFishIndividualId(`x${String(index)}`) })),
      ).state
    }

    const restored = await saveAndReload(saveWith(codex, progressionAt(3)))

    expect(restored.codex.species['test-species']?.catchCount).toBe(3)
  })

  it('keeps the largest length', async () => {
    let codex = emptyCodexState()
    codex = recordCatch(codex, toRecordEntry(individualWith({ lengthCm: 22 }))).state
    codex = recordCatch(codex, toRecordEntry(individualWith({ lengthCm: 34.5 }))).state

    const restored = await saveAndReload(saveWith(codex, progressionAt(3)))

    expect(restored.codex.species['test-species']?.largestLengthCm).toBe(34.5)
  })

  it('keeps the heaviest weight', async () => {
    let codex = emptyCodexState()
    codex = recordCatch(codex, toRecordEntry(individualWith({ weightKg: 0.3 }))).state
    codex = recordCatch(codex, toRecordEntry(individualWith({ weightKg: 0.62 }))).state

    const restored = await saveAndReload(saveWith(codex, progressionAt(3)))

    expect(restored.codex.species['test-species']?.heaviestWeightKg).toBe(0.62)
  })

  it('keeps the best percentile', async () => {
    let codex = emptyCodexState()
    codex = recordCatch(codex, toRecordEntry(individualWith({ percentile: 60 }))).state
    codex = recordCatch(codex, toRecordEntry(individualWith({ percentile: 98.75 }))).state

    const restored = await saveAndReload(saveWith(codex, progressionAt(3)))

    expect(restored.codex.species['test-species']?.bestPercentile).toBe(98.75)
  })

  it('keeps the caught traits', async () => {
    let codex = emptyCodexState()
    codex = recordCatch(codex, toRecordEntry(individualWith({ traits: ['heavy'] }))).state
    codex = recordCatch(codex, toRecordEntry(individualWith({ traits: ['heavy', 'old'] }))).state

    const restored = await saveAndReload(saveWith(codex, progressionAt(3)))

    expect(restored.codex.species['test-species']?.caughtTraits).toEqual(['heavy', 'old'])
  })

  it('keeps the personal best individual', async () => {
    let codex = emptyCodexState()
    codex = recordCatch(codex, toRecordEntry(individualWith({ percentile: 40 }))).state
    codex = recordCatch(
      codex,
      toRecordEntry(
        individualWith({
          id: asFishIndividualId('test-species#best'),
          lengthCm: 38,
          weightKg: 0.9,
          percentile: 99.2,
        }),
        '2026-02-02T00:00:00.000Z',
      ),
    ).state

    const restored = await saveAndReload(saveWith(codex, progressionAt(3)))
    const best = restored.codex.species['test-species']?.personalBest

    expect(String(best?.individualId)).toBe('test-species#best')
    expect(best?.lengthCm).toBe(38)
    expect(best?.percentile).toBe(99.2)
    expect(best?.capturedAt).toBe('2026-02-02T00:00:00.000Z')
  })

  it('does not award the first catch bonus again after reloading', async () => {
    const recorded = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 30 })),
    ).state
    const restored = await saveAndReload(saveWith(recorded, progressionAt(5)))

    const resolution = catchWith(restored.codex, individualWith({ percentile: 55 }))

    expect(resolution.record.isFirstCatchOfSpecies).toBe(false)
    expect(factorLabels(resolution)).not.toContain('first catch')
  })

  it('does not award the personal record bonus again for a smaller fish', async () => {
    const recorded = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 87.5 })),
    ).state
    const restored = await saveAndReload(saveWith(recorded, progressionAt(5)))

    const resolution = catchWith(restored.codex, individualWith({ percentile: 40 }))

    expect(resolution.record.isPersonalBest).toBe(false)
    expect(factorLabels(resolution)).not.toContain('personal record')
    expect(resolution.progression.repetition.species['test-species']).toBe(1)
  })

  it('still awards the personal record bonus for a genuinely better fish', async () => {
    const recorded = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 87.5 })),
    ).state
    const restored = await saveAndReload(saveWith(recorded, progressionAt(5)))

    const resolution = catchWith(restored.codex, individualWith({ percentile: 99.5 }))

    expect(resolution.record.isPersonalBest).toBe(true)
    expect(factorLabels(resolution)).toContain('personal record')
    // 自己記録は減衰の対象外。
    expect(resolution.xp.decayMultiplier).toBe(1)
  })

  it('starts with an empty codex after migrating an old save', () => {
    const result = migrateSave(createValidSaveV1())

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.save.codex).toEqual({ species: {} })

    // 旧 Save では記録が無いので、次の 1 匹は正しく初捕獲になる。
    const resolution = catchWith(result.save.codex, individualWith())

    expect(resolution.record.isFirstCatchOfSpecies).toBe(true)
    expect(factorLabels(resolution)).toContain('first catch')
  })

  it('does not fall back to an empty codex when the saved codex is present', async () => {
    const recorded = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 99.9 })),
    ).state

    const restored = await saveAndReload(saveWith(recorded, progressionAt(4)))

    // 空に戻っていないこと（正規化はあくまで「キーが無いとき」だけ）。
    expect(Object.keys(restored.codex.species)).toHaveLength(1)
    expect(restored.codex.species['test-species']?.bestPercentile).toBe(99.9)
  })

  it('keeps progression and codex consistent across a reload', async () => {
    const random = new SeededRandomSource('consistency')
    let codex = emptyCodexState()
    let progression = progressionAt(1)

    for (let index = 0; index < 10; index += 1) {
      const generated = generateFishIndividual({
        species,
        random,
        individualSeed: `test-species#${String(index)}`,
      })

      const resolution = resolveCatch({
        individual: generated.individual,
        species,
        codex,
        progression,
        spotId: 'test-spot',
      })

      codex = resolution.codex
      progression = resolution.progression
    }

    const restored = await saveAndReload(saveWith(codex, progression))

    expect(restored.codex).toEqual(codex)
    expect(restored.progression).toEqual(progression)
    expect(restored.codex.species['test-species']?.catchCount).toBe(10)
  })
})
