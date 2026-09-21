import { afterEach, describe, expect, it } from 'vitest'
import {
  createPersistenceCoordinator,
  type PersistenceCoordinator,
} from '../../src/app/persistence/persistenceCoordinator'
import {
  emptyCodexState,
  recordCatch,
  toRecordEntry,
  type CodexState,
} from '../../src/domain/codex'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import { asFishIndividualId } from '../../src/domain/ids'
import {
  createInitialProgression,
  totalXpForLevel,
  type AnglerProgression,
} from '../../src/domain/progression'
import type { SaveRepository } from '../../src/domain/save/SaveRepository'
import type { CurrentSave, SaveGameV1, SaveGameV2 } from '../../src/domain/save/SaveGame'
import { createPlayerStore, type PlayerStore } from '../../src/state/playerStore'
import { createValidSaveV1, createValidSaveV2 } from '../fixtures/save'
import { createTestSpecies } from '../fixtures/species'

/**
 * Save / Load の配線。
 *
 * 実際の IndexedDB は使わず、Fake の SaveRepository で
 * 「読む → 移行する → Store へ入れる → 変更を保存する」流れを確認する。
 */

class FakeSaveRepository implements SaveRepository {
  stored: unknown = null
  saveCalls = 0
  loadCalls = 0
  saveError: Error | null = null
  loadError: Error | null = null

  private deferred: ((value: unknown | null) => void) | null = null
  private deferNext = false

  loadRaw(): Promise<unknown | null> {
    this.loadCalls += 1

    if (this.loadError !== null) {
      return Promise.reject(this.loadError)
    }

    if (this.deferNext) {
      this.deferNext = false
      return new Promise<unknown | null>((resolve) => {
        this.deferred = resolve
      })
    }

    return Promise.resolve(this.stored)
  }

  /** 次の loadRaw を保留する（hydration 中の事故を再現するため）。 */
  holdNextLoad(): void {
    this.deferNext = true
  }

  releaseLoad(): void {
    const resolve = this.deferred
    this.deferred = null
    resolve?.(this.stored)
  }

  save(save: CurrentSave): Promise<void> {
    this.saveCalls += 1

    if (this.saveError !== null) {
      return Promise.reject(this.saveError)
    }

    // 永続化と同じく、参照ではなくコピーを保存する。
    this.stored = JSON.parse(JSON.stringify(save)) as unknown
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.stored = null
    return Promise.resolve()
  }

  saved(): SaveGameV2 | null {
    return this.stored === null ? null : (this.stored as SaveGameV2)
  }
}

const species = createTestSpecies()
const coordinators: PersistenceCoordinator[] = []

afterEach(() => {
  for (const coordinator of coordinators) {
    coordinator.stop()
  }
  coordinators.length = 0
})

const individualWith = (overrides: Partial<FishIndividual> = {}): FishIndividual => ({
  id: asFishIndividualId('test-species#one'),
  speciesId: species.id,
  lengthCm: 25,
  weightKg: 0.25,
  condition: 0.5,
  traits: [],
  fightSeed: 'test-species#one',
  percentile: 50,
  ...overrides,
})

const progressionAt = (level: number): AnglerProgression => ({
  ...createInitialProgression(),
  anglerLevel: level,
  totalXp: totalXpForLevel(level),
})

const saveWith = (
  overrides: { readonly progression?: AnglerProgression; readonly codex?: CodexState } = {},
): SaveGameV2 => ({
  ...createValidSaveV2(),
  ...(overrides.progression === undefined ? {} : { progression: overrides.progression }),
  ...(overrides.codex === undefined ? {} : { codex: overrides.codex }),
})

const setup = (
  stored: unknown = null,
): {
  readonly repository: FakeSaveRepository
  readonly store: PlayerStore
  readonly coordinator: PersistenceCoordinator
} => {
  const repository = new FakeSaveRepository()
  repository.stored = stored
  const store = createPlayerStore()
  const coordinator = createPersistenceCoordinator({
    repository,
    store,
    now: () => '2026-03-01T00:00:00.000Z',
  })
  coordinators.push(coordinator)

  return { repository, store, coordinator }
}

const catchOnce = (store: PlayerStore, overrides: Partial<FishIndividual> = {}): void => {
  store.getState().recordCatch({
    individual: individualWith(overrides),
    species,
    spotId: 'test-spot',
  })
}

describe('persistence coordinator', () => {
  it('starts fresh when there is no save', async () => {
    const { store, repository, coordinator } = setup(null)

    await expect(coordinator.start()).resolves.toBe('ready')

    expect(store.getState().hydrationStatus).toBe('ready')
    expect(store.getState().progression.anglerLevel).toBe(1)
    expect(store.getState().codex.species).toEqual({})
    // 新規開始では何も書き込まない。
    expect(repository.saveCalls).toBe(0)
  })

  it('hydrates from a valid v2 save', async () => {
    const codex = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 92 })),
    ).state
    const save = saveWith({ progression: progressionAt(4), codex })
    const { store, coordinator } = setup(save)

    await expect(coordinator.start()).resolves.toBe('ready')

    expect(store.getState().hydrationStatus).toBe('ready')
    expect(store.getState().progression.anglerLevel).toBe(4)
    expect(store.getState().codex).toEqual(codex)
    expect(store.getState().codex.species['test-species']?.catchCount).toBe(1)
  })

  it('migrates a v1 save before hydrating', async () => {
    const v1 = createValidSaveV1()
    const legacy: SaveGameV1 = {
      ...v1,
      progression: { ...v1.progression, anglerLevel: 4, anglerXp: 10 },
    }
    const { store, coordinator } = setup(legacy)

    await expect(coordinator.start()).resolves.toBe('ready')

    expect(store.getState().progression.anglerLevel).toBe(4)
    expect(store.getState().progression.anglerXp).toBe(10)
    expect(store.getState().progression.totalXp).toBe(totalXpForLevel(4) + 10)
    // 旧 Save には記録が無いので Codex は空から。
    expect(store.getState().codex.species).toEqual({})
  })

  it('round trips the progression', async () => {
    const { store, repository, coordinator } = setup(
      saveWith({ progression: { ...progressionAt(5), skillPoints: 2 } }),
    )
    await coordinator.start()

    store.getState().spendSkillPoint('fighting')
    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()

    expect(reloaded.store.getState().progression).toEqual(store.getState().progression)
    expect(reloaded.store.getState().progression.skills.fighting).toBe(1)
  })

  it('round trips the codex', async () => {
    const caught = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ lengthCm: 33, weightKg: 0.6, percentile: 96 })),
    ).state
    const { store, repository, coordinator } = setup(saveWith({ codex: caught }))
    await coordinator.start()

    catchOnce(store, { percentile: 99 })
    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()

    expect(reloaded.store.getState().codex).toEqual(store.getState().codex)
    expect(reloaded.store.getState().codex.species['test-species']?.catchCount).toBe(2)
  })

  it('autosaves a skill allocation', async () => {
    const progression = { ...progressionAt(3), skillPoints: 3 }
    const { store, repository, coordinator } = setup(saveWith({ progression }))
    await coordinator.start()

    store.getState().spendSkillPoint('casting', 2)
    await coordinator.flush()

    const saved = repository.saved()

    expect(saved?.progression.skills.casting).toBe(2)
    expect(saved?.progression.skillPoints).toBe(1)
    // hydration 直後に 1 回（読み込んだ内容の確定）保存され、
    // 割り振りでさらに 1 回保存される。
    expect(repository.saveCalls).toBe(2)
  })

  it('autosaves the progression and codex after a catch', async () => {
    const { store, repository, coordinator } = setup()
    await coordinator.start()

    catchOnce(store)
    await coordinator.flush()

    const saved = repository.saved()

    expect(saved?.codex.species['test-species']?.catchCount).toBe(1)
    expect(saved?.progression.totalXp).toBeGreaterThan(0)
    expect(saved?.progression.repetition.species['test-species']).toBe(1)
  })

  it('does not award the first catch bonus again after a reload', async () => {
    const codex = recordCatch(emptyCodexState(), toRecordEntry(individualWith())).state
    const { repository, coordinator } = setup(saveWith({ codex }))
    await coordinator.start()
    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()
    catchOnce(reloaded.store, { percentile: 60 })

    const summary = reloaded.store.getState().lastCatch

    expect(summary?.firstCatch).toBe(false)
    expect(summary?.factors.map((factor) => factor.label)).not.toContain('first catch')
  })

  it('does not award the personal record bonus again for a smaller fish', async () => {
    const codex = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 90 })),
    ).state
    const { repository, coordinator } = setup(saveWith({ codex }))
    await coordinator.start()
    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()
    catchOnce(reloaded.store, { percentile: 20 })

    const summary = reloaded.store.getState().lastCatch

    expect(summary?.personalBest).toBe(false)
    expect(summary?.factors.map((factor) => factor.label)).not.toContain('personal record')
  })

  it('still awards the personal record bonus for a better fish after a reload', async () => {
    const codex = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 60 })),
    ).state
    const { repository, coordinator } = setup(saveWith({ codex }))
    await coordinator.start()
    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()
    catchOnce(reloaded.store, { percentile: 99.5 })

    const summary = reloaded.store.getState().lastCatch

    expect(summary?.personalBest).toBe(true)
    expect(summary?.factors.map((factor) => factor.label)).toContain('personal record')
  })

  it('keeps the repetition decay after a reload', async () => {
    const { store, repository, coordinator } = setup()
    await coordinator.start()

    for (let index = 0; index < 12; index += 1) {
      catchOnce(store, { id: asFishIndividualId(`test-species#${String(index)}`) })
    }

    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()

    expect(reloaded.store.getState().progression.repetition.species['test-species']).toBe(12)

    catchOnce(reloaded.store, { id: asFishIndividualId('test-species#after-reload') })

    const summary = reloaded.store.getState().lastCatch

    // 13 匹目は 11〜20 匹の帯なので減衰がかかる。
    expect(summary?.decayMultiplier).toBe(0.6)
  })

  it('never writes to storage before hydration completes', async () => {
    const save = saveWith({ progression: progressionAt(7) })
    const { store, repository, coordinator } = setup(save)

    repository.holdNextLoad()
    const started = coordinator.start()

    // hydration 中に Store が（初期値や別の値で）変わっても書き込まれない。
    store.setState({ progression: createInitialProgression() })
    await Promise.resolve()

    expect(repository.saveCalls).toBe(0)
    expect(store.getState().hydrationStatus).toBe('hydrating')

    repository.releaseLoad()
    await expect(started).resolves.toBe('ready')

    // 既存 Save が初期状態（別の値）で上書きされていない。
    expect(repository.saved()?.progression.anglerLevel).toBe(7)
    expect(repository.saved()?.codex).toEqual(save.codex)
    expect(store.getState().progression.anglerLevel).toBe(7)
  })

  it('enters the error state on a malformed save', async () => {
    const { store, repository, coordinator } = setup({ schemaVersion: 2, nonsense: true })

    await expect(coordinator.start()).resolves.toBe('error')

    expect(store.getState().hydrationStatus).toBe('error')
    expect(store.getState().hydrationFailure?.reason).toBe('invalid_save')
    expect(repository.saveCalls).toBe(0)
  })

  it('does not overwrite a malformed save with the initial state', async () => {
    const broken = { schemaVersion: 2, nonsense: true }
    const { store, repository, coordinator } = setup(broken)
    await coordinator.start()

    // エラー直後は保存しない。
    store.getState().completeHydrationWithoutSave()
    await coordinator.flush()
    expect(repository.stored).toEqual(broken)
    expect(repository.saveCalls).toBe(0)

    // プレイヤーが新規で始めて、実際に釣ったら新しい Save になる。
    catchOnce(store)
    await coordinator.flush()

    expect(repository.saved()?.codex.species['test-species']?.catchCount).toBe(1)
  })

  it('enters the error state when storage is unavailable', async () => {
    const { store, repository, coordinator } = setup(null)
    repository.loadError = new Error('IndexedDB is not available in this environment')

    await expect(coordinator.start()).resolves.toBe('error')

    expect(store.getState().hydrationFailure?.reason).toBe('storage_unavailable')
    expect(repository.saveCalls).toBe(0)
  })

  it('hydrates without triggering domain side effects', async () => {
    const codex = recordCatch(
      emptyCodexState(),
      toRecordEntry(individualWith({ percentile: 88 })),
    ).state
    const progression = { ...progressionAt(6), skillPoints: 4 }
    const { store, coordinator } = setup(saveWith({ progression, codex }))

    await coordinator.start()

    const state = store.getState()

    // XP も記録も動いていない（保存された値そのまま）。
    expect(state.progression).toEqual(progression)
    expect(state.codex).toEqual(codex)
    expect(state.lastCatch).toBeNull()
    expect(state.progression.totalXp).toBe(progressionAt(6).totalXp)
  })

  it('does not crash when saving fails, and records the error', async () => {
    const { store, repository, coordinator } = setup()
    await coordinator.start()
    repository.saveError = new Error('quota exceeded')

    catchOnce(store)
    await coordinator.flush()

    expect(coordinator.lastSaveError()).toBe('quota exceeded')
    expect(store.getState().codex.species['test-species']?.catchCount).toBe(1)
  })

  it('ignores player actions before hydration', () => {
    const { store } = setup(saveWith({ progression: progressionAt(9) }))

    expect(store.getState().hydrationStatus).toBe('idle')

    catchOnce(store)
    store.getState().spendSkillPoint('casting')

    expect(store.getState().codex.species).toEqual({})
    expect(store.getState().progression.anglerLevel).toBe(1)
  })
})
