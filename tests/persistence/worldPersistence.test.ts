import { describe, expect, it } from 'vitest'
import { createPersistenceCoordinator } from '../../src/app/persistence/persistenceCoordinator'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import { addSpotKnowledge } from '../../src/domain/knowledge/spotKnowledge'
import type { CurrentSave } from '../../src/domain/save/SaveGame'
import { advanceMinutes } from '../../src/domain/world/WorldTime'
import {
  createInitialWorld,
  recordFishingAttempt,
  arriveAtSpot,
  leaveForSpot,
} from '../../src/domain/world/worldSession'
import type { WorldState } from '../../src/domain/world/worldSession'
import { InMemorySaveRepository } from '../../src/infrastructure/persistence/inMemorySaveRepository'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { createPlayerStore, type PlayerStore } from '../../src/state/playerStore'
import { createValidSaveV1, createValidSaveV2, createValidSaveV6 } from '../fixtures/save'
import { createTestSpot } from '../fixtures/spots'
import { createTestTransportState, TEST_TRANSPORTS } from '../fixtures/transports'

/**
 * World（時間・位置・Knowledge）の永続化。
 *
 * ここで守りたいのは「釣行の途中で閉じても、時刻と知識と位置が戻ること」。
 */

const spot = createTestSpot()

const worldAfterFishing = (): WorldState => {
  const left = leaveForSpot({
    context: { world: createInitialWorld(), knowledge: emptyKnowledgeState() },
    spot,
    transports: TEST_TRANSPORTS,
    playerTransports: createTestTransportState(),
  })

  if (!left.ok) {
    throw new Error(left.message)
  }

  const arrived = arriveAtSpot({ context: left.context, spot })

  if (!arrived.ok) {
    throw new Error(arrived.message)
  }

  const fished = recordFishingAttempt({
    context: arrived.context,
    spot,
    outcome: 'landed',
    xpGained: 120,
    caughtLengthCm: 31,
  })

  if (!fished.ok) {
    throw new Error(fished.message)
  }

  return fished.context.world
}

const saveWithWorld = (
  world: WorldState,
  save: CurrentSave = createValidSaveV6(),
): CurrentSave => ({
  ...save,
  world,
})

const reload = async (save: CurrentSave): Promise<CurrentSave> => {
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

describe('world persistence', () => {
  it('round trips the world through save and load', async () => {
    const world = worldAfterFishing()
    const restored = await reload(saveWithWorld(world))

    expect(restored.world).toEqual(world)
  })

  it('restores the world time after a reload', async () => {
    const world = worldAfterFishing()
    const restored = await reload(saveWithWorld(world))

    expect(restored.world.time).toEqual(world.time)
    // 徒歩 20 分 + 釣り 20 分 = 06:40
    expect(restored.world.time.minute).toBe(40)
    expect(restored.world.phase).toBe('AT_SPOT')
    expect(restored.world.currentSpotId).toBe('test-spot')
  })

  it('restores the spot knowledge after a reload', async () => {
    const knowledge = addSpotKnowledge(emptyKnowledgeState(), 'test-spot', 23)
    const restored = await reload({ ...createValidSaveV6(), knowledge })

    expect(restored.knowledge.spots['test-spot']).toBe(23)
  })

  it('restores discovered spots and the independent transport state', async () => {
    const world = worldAfterFishing()
    const restored = await reload(saveWithWorld(world))

    expect(restored.world.discoveredSpotIds).toEqual(['test-spot'])
    expect(restored.transport.availableTransportIds).toEqual([
      'walk',
      'train',
      'bus',
      'rental-car',
      'rental-boat',
    ])
  })

  it('migrates a v2 save without losing progression or codex', async () => {
    const v2 = createValidSaveV2()
    const result = migrateSave(v2)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.save.progression).toEqual(v2.progression)
    expect(result.save.codex).toEqual(v2.codex)
    expect(result.save.world.time).toEqual(createInitialWorld().time)
    expect(result.save.world.phase).toBe('HOME')
  })

  it('migrates a v1 save straight to the current version', () => {
    const result = migrateSave(createValidSaveV1())

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.save.schemaVersion).toBe(6)
      expect(result.save.world.phase).toBe('HOME')
      expect(result.save.codex.species).toEqual({})
    }
  })

  it('rejects a malformed world instead of loading it', () => {
    const broken = {
      ...createValidSaveV6(),
      world: {
        ...createInitialWorld(),
        time: { year: 2026, month: 5, day: 2, hour: 99, minute: 0 },
      },
    }

    const result = migrateSave(broken)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
    }
  })

  it('rejects an unknown world phase', () => {
    const broken = {
      ...createValidSaveV6(),
      world: { ...createInitialWorld(), phase: 'DIVING' },
    }

    expect(migrateSave(broken).ok).toBe(false)
  })

  it('keeps the world advancing after a reload', async () => {
    const world = worldAfterFishing()
    const restored = await reload(saveWithWorld(world))

    // 読み込んだ状態から釣りを続けられる。
    const next = recordFishingAttempt({
      context: { world: restored.world, knowledge: emptyKnowledgeState() },
      spot,
      outcome: 'failed',
      xpGained: 0,
    })

    expect(next.ok).toBe(true)

    if (next.ok) {
      expect(next.context.world.trip?.attempts).toBe(2)
      // 06:40 からさらに 20 分進んで 07:00
      expect(next.context.world.time.hour).toBe(7)
      expect(next.context.world.time.minute).toBe(0)
    }
  })

  it('does not autosave before hydration completes', async () => {
    const stored = saveWithWorld(worldAfterFishing())
    const repository = new InMemorySaveRepository()
    await repository.save(stored)

    const store: PlayerStore = createPlayerStore()
    const coordinator = createPersistenceCoordinator({
      repository,
      store,
      now: () => '2026-05-02T00:00:00.000Z',
    })

    // hydration 前に Store が変わっても、既存 Save を書き換えない。
    const otherTime = advanceMinutes(createInitialWorld().time, 600)
    store.setState({ world: { ...createInitialWorld(), time: otherTime } })
    expect(store.getState().hydrationStatus).toBe('idle')

    await coordinator.start()

    const loaded = (await repository.loadRaw()) as CurrentSave

    expect(loaded.world.time.minute).toBe(40)
    coordinator.stop()
  })

  it('hands the world to the store on hydration', async () => {
    const stored = saveWithWorld(worldAfterFishing())
    const repository = new InMemorySaveRepository()
    await repository.save(stored)

    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    expect(store.getState().world.phase).toBe('AT_SPOT')
    expect(store.getState().world.time.minute).toBe(40)
    coordinator.stop()
  })

  it('saves the world after a fishing attempt', async () => {
    const repository = new InMemorySaveRepository()
    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    const traveled = store.getState().travelToSpot(spot, TEST_TRANSPORTS)
    expect(traveled.ok).toBe(true)

    store.getState().recordAttempt({ spot, outcome: 'failed', xpGained: 0 })
    await coordinator.flush()

    const saved = (await repository.loadRaw()) as CurrentSave

    expect(saved.world.phase).toBe('AT_SPOT')
    expect(saved.world.trip?.attempts).toBe(1)
    expect(saved.knowledge.spots['test-spot']).toBeGreaterThan(0)
    coordinator.stop()
  })
})
