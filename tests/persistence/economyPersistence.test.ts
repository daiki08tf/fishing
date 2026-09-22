import { describe, expect, it } from 'vitest'
import { createPersistenceCoordinator } from '../../src/app/persistence/persistenceCoordinator'
import { createInitialFinanceState } from '../../src/domain/economy/FinanceState'
import { asShopItemId, asTransportId } from '../../src/domain/ids'
import { grantOwnedTransport } from '../../src/domain/access/Transport'
import type { CurrentSave } from '../../src/domain/save/SaveGame'
import { InMemorySaveRepository } from '../../src/infrastructure/persistence/inMemorySaveRepository'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { createPlayerStore } from '../../src/state/playerStore'
import {
  createValidSaveV1,
  createValidSaveV2,
  createValidSaveV3,
  createValidSaveV8,
} from '../fixtures/save'
import { createTestSpot } from '../fixtures/spots'
import { TEST_TRANSPORTS } from '../fixtures/transports'

/**
 * Economy / Schedule の永続化。
 * progression / codex / world / knowledge を絶対に失わないことも確認する。
 */

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

describe('economy persistence', () => {
  it('round trips the finance block', async () => {
    const finance = {
      ...createInitialFinanceState(),
      cash: 123_456,
      lastSettledMonth: '2026-06',
      transactions: [
        {
          id: 'salary-0-2026-06-01',
          kind: 'salary' as const,
          amount: 300_000,
          label: '給与',
          at: '2026-06-01',
        },
      ],
    }
    const restored = await reload({ ...createValidSaveV8(), finance })

    expect(restored.finance).toEqual(finance)
  })

  it('round trips the purchases', async () => {
    const purchases = [asShopItemId('used-compact-car')]
    const restored = await reload({ ...createValidSaveV8(), purchases })

    expect(restored.purchases).toEqual(purchases)
  })

  it('round trips the owned transport', async () => {
    const save = createValidSaveV8()
    const restored = await reload({
      ...save,
      transport: grantOwnedTransport(save.transport, asTransportId('used-compact-car')),
    })

    expect(restored.transport.ownedTransportIds).toContain('used-compact-car')
  })

  it('migrates a v3 save without losing progression, codex, knowledge or world', () => {
    const v3 = createValidSaveV3()
    const result = migrateSave(v3)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.save.progression).toEqual(v3.progression)
    expect(result.save.codex).toEqual(v3.codex)
    expect(result.save.knowledge).toEqual(v3.knowledge)
    expect(result.save.world.time).toEqual(v3.world.time)
    expect(result.save.world.phase).toBe(v3.world.phase)
    expect(result.save.world.discoveredSpotIds).toEqual(v3.world.discoveredSpotIds)
    expect(result.save.finance.cash).toBe(v3.finance.cash)
    expect(result.save.finance.lastSettledMonth).toBeNull()
    expect(result.save.purchases).toEqual([])
  })

  it('migrates v1 and v2 saves up to the current version', () => {
    for (const save of [createValidSaveV1(), createValidSaveV2()]) {
      const result = migrateSave(save)

      expect(result.ok).toBe(true)

      if (result.ok) {
        expect(result.save.schemaVersion).toBe(8)
        expect(result.save.world.phase).toBe('HOME')
      }
    }
  })

  it('rejects a malformed finance block', () => {
    const broken = {
      ...createValidSaveV8(),
      finance: { ...createInitialFinanceState(), lastSettledMonth: 'May' },
    }

    expect(migrateSave(broken).ok).toBe(false)
  })

  it('does not persist a work schedule at all', () => {
    const save = createValidSaveV8() as unknown as Record<string, unknown>

    // 仕事の予定（勤務時間・有給）はゲームシステムではないので保存しない。
    expect(save['schedule']).toBeUndefined()
    expect(Object.keys(save)).not.toContain('paidLeaveDays')
  })

  it('does not autosave before hydration completes', async () => {
    const repository = new InMemorySaveRepository()
    await repository.save(createValidSaveV8())

    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })

    store.setState({ finance: { ...createInitialFinanceState(), cash: 9_999_999 } })

    expect(store.getState().hydrationStatus).toBe('idle')

    await coordinator.start()

    const loaded = (await repository.loadRaw()) as CurrentSave

    expect(loaded.finance.cash).toBe(createValidSaveV8().finance.cash)
    coordinator.stop()
  })

  it('saves the finance and schedule after a trip', async () => {
    const repository = new InMemorySaveRepository()
    await repository.save(createInitialSave({ now: '2026-05-01T00:00:00.000Z' }))

    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    // 交通費がかかる釣り場で確認する（徒歩は無料のため）。
    const paidSpot = createTestSpot({
      access: [{ kind: 'capability', capability: 'public_transport' }],
      travelOptions: [
        {
          id: 'paid-train-route',
          transportTypes: ['train'],
          requiredCapabilities: ['public_transport'],
          features: [],
          baseMinutes: 20,
          distanceKm: 15,
          baseOneWayCost: 420,
        },
      ],
    })
    const traveled = store.getState().travelToSpot(paidSpot, TEST_TRANSPORTS)
    expect(traveled.ok).toBe(true)

    await coordinator.flush()

    const saved = (await repository.loadRaw()) as CurrentSave

    expect(saved.finance.transactions.length).toBeGreaterThan(0)
    expect(saved.finance.cash).toBeLessThan(createInitialFinanceState().cash)
    expect(saved.world.time).toEqual(store.getState().world.time)
    coordinator.stop()
  })
})
