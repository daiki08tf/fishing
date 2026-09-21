import { describe, expect, it } from 'vitest'
import { asGearId } from '../ids'
import {
  checkSlotChange,
  createStarterInventory,
  createStarterLoadout,
  loadoutGearIds,
  slotGearId,
  STARTER_GEAR_IDS,
  STARTER_METHOD_ID,
  withSlot,
} from './Loadout'
import {
  GEAR_FIXTURE_IDS,
  gearFixture,
  inventoryFixture,
  loadoutFixture,
} from '../../../tests/fixtures/gear'

const gear = gearFixture()

describe('starter loadout', () => {
  it('uses the declared starter ids for every slot', () => {
    const loadout = createStarterLoadout(asGearId)

    expect(loadout.rodId).toBe(STARTER_GEAR_IDS.rodId)
    expect(loadout.reelId).toBe(STARTER_GEAR_IDS.reelId)
    expect(loadout.lineId).toBe(STARTER_GEAR_IDS.lineId)
    expect(loadout.leaderId).toBe(STARTER_GEAR_IDS.leaderId)
    expect(loadout.hookId).toBe(STARTER_GEAR_IDS.hookId)
    expect(loadout.offeringId).toBe(STARTER_GEAR_IDS.lureId)
    expect(loadout.methodId).toBe(STARTER_METHOD_ID)
  })

  it('starts with every starter gear owned', () => {
    const inventory = createStarterInventory(asGearId)

    for (const id of [
      STARTER_GEAR_IDS.rodId,
      STARTER_GEAR_IDS.reelId,
      STARTER_GEAR_IDS.lineId,
      STARTER_GEAR_IDS.leaderId,
      STARTER_GEAR_IDS.hookId,
      STARTER_GEAR_IDS.lureId,
      STARTER_GEAR_IDS.baitId,
    ]) {
      expect(inventory.ownedGearIds).toContain(id)
    }
  })
})

describe('loadout slots', () => {
  it('reads the gear id of each slot', () => {
    const loadout = loadoutFixture()

    expect(slotGearId(loadout, 'rod')).toBe(loadout.rodId)
    expect(slotGearId(loadout, 'reel')).toBe(loadout.reelId)
    expect(slotGearId(loadout, 'line')).toBe(loadout.lineId)
    expect(slotGearId(loadout, 'leader')).toBe(loadout.leaderId)
    expect(slotGearId(loadout, 'hook')).toBe(loadout.hookId)
    expect(slotGearId(loadout, 'offering')).toBe(loadout.offeringId)
  })

  it('lists every equipped gear id', () => {
    const loadout = loadoutFixture()

    expect(loadoutGearIds(loadout)).toEqual([
      loadout.rodId,
      loadout.reelId,
      loadout.lineId,
      loadout.leaderId,
      loadout.hookId,
      loadout.offeringId,
    ])
  })

  it('allows unequipping the leader but not the other slots', () => {
    const loadout = loadoutFixture()
    const withoutLeader = withSlot(loadout, 'leader', null)

    expect(withoutLeader.leaderId).toBeNull()
    expect(loadoutGearIds(withoutLeader)).not.toContain(loadout.leaderId)

    // 必須スロットは null を渡しても変わらない（消せない）。
    expect(withSlot(loadout, 'rod', null).rodId).toBe(loadout.rodId)
    expect(withSlot(loadout, 'offering', null).offeringId).toBe(loadout.offeringId)
  })
})

describe('checkSlotChange', () => {
  it('accepts an owned gear of the right category', () => {
    const result = checkSlotChange({
      slot: 'rod',
      gearId: asGearId(GEAR_FIXTURE_IDS.rodFinesse),
      gear,
      ownedGearIds: inventoryFixture().ownedGearIds,
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a gear that does not exist', () => {
    const result = checkSlotChange({
      slot: 'rod',
      gearId: asGearId('does-not-exist'),
      gear,
      ownedGearIds: inventoryFixture().ownedGearIds,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'unknown_gear',
      message: expect.any(String),
    })
  })

  it('rejects a gear that is not owned', () => {
    const result = checkSlotChange({
      slot: 'rod',
      gearId: asGearId(GEAR_FIXTURE_IDS.rodFinesse),
      gear,
      ownedGearIds: [asGearId(GEAR_FIXTURE_IDS.rodBalanced)],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('not_owned')
    }
  })

  it('rejects a gear of the wrong category for the slot', () => {
    const result = checkSlotChange({
      slot: 'rod',
      gearId: asGearId(GEAR_FIXTURE_IDS.reelPower),
      gear,
      ownedGearIds: inventoryFixture().ownedGearIds,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('wrong_category')
    }
  })

  it('rejects a rod in the offering slot', () => {
    const result = checkSlotChange({
      slot: 'offering',
      gearId: asGearId(GEAR_FIXTURE_IDS.rodBalanced),
      gear,
      ownedGearIds: inventoryFixture().ownedGearIds,
    })

    expect(result.ok).toBe(false)
  })
})
