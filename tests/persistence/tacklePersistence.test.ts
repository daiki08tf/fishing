import { describe, expect, it } from 'vitest'
import { createPersistenceCoordinator } from '../../src/app/persistence/persistenceCoordinator'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { createInitialFinanceState, spendCash } from '../../src/domain/economy'
import { asGearId, asShopItemId } from '../../src/domain/ids'
import type { CurrentSave } from '../../src/domain/save/SaveGame'
import { addGear, ownsGear } from '../../src/domain/tackle'
import { InMemorySaveRepository } from '../../src/infrastructure/persistence/inMemorySaveRepository'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { createPlayerStore } from '../../src/state/playerStore'
import { createValidSaveV4, createValidSaveV9 } from '../fixtures/save'

/**
 * Tackle（Phase 6）の永続化。
 *
 * 装備と所持が再起動で消えると、プレイヤーは買い直しを強いられる。
 * progression / codex / world / knowledge / finance / purchases を
 * 絶対に失わないことも同時に確認する。
 */

const content = loadContentFromDirectory()
const catalog = { gear: content.gear, methods: content.methods }

const gearOf = (id: string) => {
  const item = content.gearById[id]

  if (item === undefined) {
    throw new Error(`unknown gear in test: ${id}`)
  }

  return item
}

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

describe('tackle persistence', () => {
  it('round trips the inventory', async () => {
    const save = createValidSaveV9()
    const withGear = {
      ...save,
      inventory: addGear(save.inventory, asGearId('rod-finesse')),
    }
    const restored = await reload(withGear)

    expect(restored.inventory.ownedGearIds).toContain('rod-finesse')
    expect(restored.inventory.ownedGearIds).toContain('starter-rod')
    expect(ownsGear(restored.inventory, asGearId('rod-finesse'))).toBe(true)
  })

  it('round trips the loadout', async () => {
    const save = createValidSaveV9()
    const withLoadout: CurrentSave = {
      ...save,
      loadout: {
        ...save.loadout,
        rodId: asGearId('rod-balanced'),
        leaderId: null,
        methodId: 'lure',
      },
    }
    const restored = await reload(withLoadout)

    expect(restored.loadout.rodId).toBe('rod-balanced')
    expect(restored.loadout.leaderId).toBeNull()
    expect(restored.loadout.methodId).toBe('lure')
  })

  it('rejects a malformed inventory instead of loading it', () => {
    const broken = {
      ...createValidSaveV9(),
      inventory: { ownedGearIds: 'not-an-array' },
    }

    const result = migrateSave(broken)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
    }
  })

  it('rejects a malformed loadout instead of loading it', () => {
    const save = createValidSaveV9()
    const broken = { ...save, loadout: { ...save.loadout, rodId: 42 } }

    expect(migrateSave(broken).ok).toBe(false)
  })

  it('rejects an unknown schemaVersion after v9', () => {
    const result = migrateSave({ ...createValidSaveV9(), schemaVersion: 10 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_future_version')
    }
  })
})

describe('tackle migration from v4', () => {
  it('grants starter gear and a valid loadout', () => {
    const result = migrateSave(createValidSaveV4())

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.save.inventory.ownedGearIds.length).toBeGreaterThanOrEqual(7)
    expect(ownsGear(result.save.inventory, result.save.loadout.rodId)).toBe(true)
    expect(ownsGear(result.save.inventory, result.save.loadout.offeringId)).toBe(true)
    expect(content.methodById[result.save.loadout.methodId]).toBeDefined()
    expect(content.gearById[String(result.save.loadout.hookId)]).toBeDefined()
  })

  it('preserves progression / codex / world / knowledge / finance / purchases / car', () => {
    const v4 = createValidSaveV4()
    const income = spendCash(createInitialFinanceState(), {
      kind: 'salary',
      amount: 120000,
      label: 'テスト収入',
      at: '2026-05-01T00:00:00.000Z',
    })

    if (!income.ok) {
      throw new Error('fixture income must succeed')
    }

    const financed: typeof v4 = {
      ...v4,
      finance: income.finance,
      purchases: v4.purchases,
      world: {
        ...v4.world,
        availableTransports: [...v4.world.availableTransports, 'car'],
      },
    }
    const result = migrateSave(financed)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.save.progression).toEqual(v4.progression)
    expect(result.save.codex).toEqual(v4.codex)
    expect(result.save.knowledge).toEqual(v4.knowledge)
    expect(result.save.finance.cash).toBe(financed.finance.cash)
    expect(result.save.purchases).toEqual(v4.purchases)
    expect(result.save.transport.ownedTransportIds).toContain('used-compact-car')
  })
})

describe('tackle store wiring', () => {
  it('hydrates inventory and loadout from a save', async () => {
    const repository = new InMemorySaveRepository()
    const save = createValidSaveV9()
    await repository.save({
      ...save,
      inventory: addGear(save.inventory, asGearId('lure-minnow-light')),
      loadout: { ...save.loadout, offeringId: asGearId('lure-minnow-light') },
    })

    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    expect(ownsGear(store.getState().inventory, asGearId('lure-minnow-light'))).toBe(true)
    expect(store.getState().loadout.offeringId).toBe('lure-minnow-light')
    coordinator.stop()
  })

  it('autosaves when the loadout changes', async () => {
    const repository = new InMemorySaveRepository()
    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    // 買っていない装備は選べない。
    const rejected = store.getState().equipGear({
      ...catalog,
      slot: 'rod',
      gearId: asGearId('rod-power'),
    })
    expect(rejected.ok).toBe(false)

    const bought = store.getState().purchaseGear({ item: gearOf('rod-finesse') })
    expect(bought.ok).toBe(true)

    const equipped = store.getState().equipGear({
      ...catalog,
      slot: 'rod',
      gearId: asGearId('rod-finesse'),
    })
    expect(equipped.ok).toBe(true)

    await coordinator.flush()

    const saved = (await repository.loadRaw()) as CurrentSave
    expect(saved.loadout.rodId).toBe('rod-finesse')
    expect(saved.inventory.ownedGearIds).toContain('rod-finesse')
    coordinator.stop()
  })

  it('does not auto-equip a purchased gear', async () => {
    const repository = new InMemorySaveRepository()
    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    const before = store.getState().loadout
    store.getState().purchaseGear({ item: gearOf('reel-power') })

    expect(store.getState().loadout).toEqual(before)
    coordinator.stop()
  })

  it('adds gear to the inventory when a shop item bundles it', async () => {
    const repository = new InMemorySaveRepository()
    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    const bundle = {
      id: asShopItemId('test-bundle'),
      name: 'テスト束ね売り',
      description: '検証用。',
      price: 500,
      category: 'gear' as const,
      grantsGearId: asGearId('hook-small'),
    }
    const result = store.getState().purchaseItem(bundle)

    expect(result.ok).toBe(true)
    expect(ownsGear(store.getState().inventory, asGearId('hook-small'))).toBe(true)
    coordinator.stop()
  })

  it('refuses a gear the player cannot afford and leaves the save alone', async () => {
    const repository = new InMemorySaveRepository()
    const save = createValidSaveV9()
    await repository.save({ ...save, finance: { ...save.finance, cash: 0 } })

    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    expect(store.getState().finance.cash).toBe(0)

    const result = store.getState().purchaseGear({ item: gearOf('rod-power') })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('insufficient_cash')
    }
    expect(store.getState().finance.cash).toBe(0)
    expect(ownsGear(store.getState().inventory, asGearId('rod-power'))).toBe(false)
    coordinator.stop()
  })

  it('refuses a second purchase of the same gear', async () => {
    const repository = new InMemorySaveRepository()
    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    const item = gearOf('hook-small')
    expect(store.getState().purchaseGear({ item }).ok).toBe(true)

    const again = store.getState().purchaseGear({ item })
    expect(again.ok).toBe(false)
    if (!again.ok) {
      expect(again.reason).toBe('already_owned')
    }
    coordinator.stop()
  })

  it('refuses an incompatible method change', async () => {
    const repository = new InMemorySaveRepository()
    const store = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store })
    await coordinator.start()

    // 初期装備はルアー。餌釣りへは offering を変えずに移れない。
    const result = store.getState().setMethod({ ...catalog, methodId: 'bait' })

    expect(result.ok).toBe(false)
    expect(store.getState().loadout.methodId).toBe('lure')
    coordinator.stop()
  })

  it('keeps the tackle when the save is reloaded', async () => {
    const repository = new InMemorySaveRepository()
    const first = createPlayerStore()
    const coordinator = createPersistenceCoordinator({ repository, store: first })
    await coordinator.start()

    first.getState().purchaseGear({ item: gearOf('lure-vibration-mid') })
    first
      .getState()
      .equipGear({ ...catalog, slot: 'offering', gearId: asGearId('lure-vibration-mid') })
    await coordinator.flush()
    coordinator.stop()

    const second = createPlayerStore()
    const reloaded = createPersistenceCoordinator({ repository, store: second })
    await reloaded.start()

    expect(second.getState().loadout.offeringId).toBe('lure-vibration-mid')
    expect(ownsGear(second.getState().inventory, asGearId('lure-vibration-mid'))).toBe(true)
    reloaded.stop()
  })
})
