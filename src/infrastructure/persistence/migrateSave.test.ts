import { describe, expect, it } from 'vitest'
import { totalXpForLevel } from '../../../src/domain/progression/AnglerLevel'
import {
  createValidSaveV1,
  createValidSaveV2,
  createValidSaveV4,
  createValidSaveV5,
  createValidSaveV6,
} from '../../../tests/fixtures/save'
import { asShopItemId } from '../../domain/ids'
import { migrateSave } from './migrateSave'

describe('migrateSave', () => {
  it('loads a valid current save', () => {
    const result = migrateSave(createValidSaveV6())

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.migratedFrom).toBe(6)
      expect(result.save.schemaVersion).toBe(6)
      expect(result.save.progression.anglerLevel).toBe(3)
      expect(result.save.progression.unlockedPerks).toEqual([])
      expect(result.save.progression.repetition.species['test-species']).toBe(3)
    }
  })

  it('grants the starter tackle when migrating a v4 save through the current version', () => {
    const v4 = createValidSaveV4()
    const result = migrateSave(v4)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.migratedFrom).toBe(4)
    expect(result.save.schemaVersion).toBe(6)

    // 成長・記録・世界・知識・資金・購入は失わない。
    expect(result.save.progression).toEqual(v4.progression)
    expect(result.save.codex).toEqual(v4.codex)
    expect(result.save.world.time).toEqual(v4.world.time)
    expect(result.save.world.phase).toBe(v4.world.phase)
    expect(result.save.world.discoveredSpotIds).toEqual(v4.world.discoveredSpotIds)
    expect(result.save.knowledge).toEqual(v4.knowledge)
    expect(result.save.finance).toEqual(v4.finance)
    expect(result.save.purchases).toEqual(v4.purchases)

    // 何も買えず釣りができない状態を作らない: Starter 一式と有効な装備が入る。
    expect(result.save.inventory.ownedGearIds.length).toBeGreaterThan(0)
    expect(result.save.loadout.methodId).toBe('lure')
    expect(result.save.inventory.ownedGearIds).toContain(result.save.loadout.rodId)
    expect(result.save.inventory.ownedGearIds).toContain(result.save.loadout.offeringId)
  })

  it('migrates v5 car access and every existing save block into v6', () => {
    const v5 = createValidSaveV5()
    const withCar = {
      ...v5,
      world: { ...v5.world, availableTransports: [...v5.world.availableTransports, 'car'] },
      purchases: [asShopItemId('used-compact-car')],
    } as const
    const result = migrateSave(withCar)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.migratedFrom).toBe(5)
    expect(result.save.schemaVersion).toBe(6)
    expect(result.save.transport.ownedTransportIds).toContain('used-compact-car')
    expect(result.save.transport.availableTransportIds).toContain('used-compact-car')
    expect(result.save.progression).toEqual(v5.progression)
    expect(result.save.codex).toEqual(v5.codex)
    expect(result.save.knowledge).toEqual(v5.knowledge)
    expect(result.save.finance).toEqual(v5.finance)
    expect(result.save.purchases).toEqual(withCar.purchases)
    expect(result.save.inventory).toEqual(v5.inventory)
    expect(result.save.loadout).toEqual(v5.loadout)
  })

  it('migrates a v1 save to the current version', () => {
    const v1 = createValidSaveV1()
    const result = migrateSave(v1)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.migratedFrom).toBe(1)
    expect(result.save.schemaVersion).toBe(6)

    // 既存の成長は保持する。
    expect(result.save.progression.anglerLevel).toBe(v1.progression.anglerLevel)
    expect(result.save.progression.anglerXp).toBe(v1.progression.anglerXp)
    expect(result.save.progression.skillPoints).toBe(v1.progression.skillPoints)
    expect(result.save.progression.skills).toEqual(v1.progression.skills)
    expect(result.save.progression.reputation).toBe(v1.progression.reputation)

    // 新設フィールドは妥当な初期値で埋まる。
    expect(result.save.progression.totalXp).toBe(
      totalXpForLevel(v1.progression.anglerLevel) + v1.progression.anglerXp,
    )
    expect(result.save.progression.unlockedPerks).toEqual([])
    expect(result.save.progression.repetition).toEqual({
      species: {},
      spots: {},
      methods: {},
    })

    // 他のブロックはそのまま引き継ぐ。
    expect(result.save.knowledge).toEqual(v1.knowledge)
    // v1 の資金ブロックは、月次精算の状態と履歴が足されて引き継がれる。
    expect(result.save.finance.cash).toBe(v1.finance.cash)
    expect(result.save.finance.salaryIncome).toBe(v1.finance.salaryIncome)
    expect(result.save.finance.simplifiedLivingCost).toBe(v1.finance.simplifiedLivingCost)
    expect(result.save.finance.lastSettledMonth).toBeNull()
    expect(result.save.finance.transactions).toEqual([])
    expect(result.save.createdAt).toBe(v1.createdAt)
    expect(result.save.updatedAt).toBe(v1.updatedAt)
  })

  it('adds the world when migrating a v2 save to v3', () => {
    const v2 = createValidSaveV2()
    const result = migrateSave(v2)

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    expect(result.migratedFrom).toBe(2)
    expect(result.save.schemaVersion).toBe(6)

    // 成長と記録は失わない。
    expect(result.save.progression).toEqual(v2.progression)
    expect(result.save.codex).toEqual(v2.codex)
    expect(result.save.knowledge).toEqual(v2.knowledge)

    // World は開始状態から始まる。
    expect(result.save.world.phase).toBe('HOME')
    expect(result.save.world.currentSpotId).toBeNull()
    expect(result.save.world.discoveredSpotIds).toEqual([])
  })

  it('is deterministic for the same input', () => {
    expect(migrateSave(createValidSaveV1())).toEqual(migrateSave(createValidSaveV1()))
    expect(migrateSave(createValidSaveV2())).toEqual(migrateSave(createValidSaveV2()))
  })

  it('does not mutate the input', () => {
    const raw = createValidSaveV1()
    const snapshot = structuredClone(raw)

    migrateSave(raw)

    expect(raw).toEqual(snapshot)
  })

  it('fails safely when schemaVersion is missing', () => {
    const withoutVersion: Record<string, unknown> = { ...createValidSaveV2() }
    delete withoutVersion['schemaVersion']

    const result = migrateSave(withoutVersion)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing_schema_version')
    }
  })

  it('fails safely on a non-object payload', () => {
    expect(migrateSave(null).ok).toBe(false)
    expect(migrateSave('save').ok).toBe(false)
    expect(migrateSave([]).ok).toBe(false)
    expect(migrateSave(42).ok).toBe(false)
  })

  it('fails safely on malformed save data', () => {
    const raw = createValidSaveV2()
    const malformed = {
      ...raw,
      progression: { ...raw.progression, anglerLevel: 'three' },
    }

    const result = migrateSave(malformed)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
      expect(result.issues.some((issue) => issue.path === 'progression.anglerLevel')).toBe(true)
    }
  })

  it('rejects skill values outside the allowed range', () => {
    const raw = createValidSaveV2()
    const result = migrateSave({
      ...raw,
      progression: { ...raw.progression, skills: { ...raw.progression.skills, casting: 101 } },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
    }
  })

  it('rejects unknown perks', () => {
    const raw = createValidSaveV2()
    const result = migrateSave({
      ...raw,
      progression: { ...raw.progression, unlockedPerks: ['magic_hands'] },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const result = migrateSave({ ...createValidSaveV2(), futureField: true })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
    }
  })

  it('normalises a v2 save that has no codex yet', () => {
    const withoutCodex: Record<string, unknown> = { ...createValidSaveV2() }
    delete withoutCodex['codex']

    const result = migrateSave(withoutCodex)

    expect(result.ok).toBe(true)

    if (result.ok) {
      // 開発途中の v2 Save（codex なし）は空の Codex として読み込む。
      expect(result.save.codex).toEqual({ species: {} })
      expect(result.save.progression.anglerLevel).toBe(3)
    }
  })

  it('rejects malformed codex data instead of silently resetting it', () => {
    const raw = createValidSaveV2()
    const record = raw.codex.species['test-species']

    const brokenCodex = {
      ...raw,
      codex: {
        species: {
          'test-species': { ...record, catchCount: -1 },
        },
      },
    }

    const result = migrateSave(brokenCodex)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
      expect(result.issues.some((issue) => issue.path.includes('catchCount'))).toBe(true)
    }
  })

  it('rejects a codex entry with an unknown trait', () => {
    const raw = createValidSaveV2()
    const record = raw.codex.species['test-species']

    const result = migrateSave({
      ...raw,
      codex: {
        species: {
          'test-species': { ...record, caughtTraits: ['magic_trait'] },
        },
      },
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a codex entry with a missing personal best', () => {
    const raw = createValidSaveV2()
    const record = raw.codex.species['test-species']
    const withoutPersonalBest: Record<string, unknown> = { ...record }
    delete withoutPersonalBest['personalBest']

    const result = migrateSave({
      ...raw,
      codex: { species: { 'test-species': withoutPersonalBest } },
    })

    expect(result.ok).toBe(false)
  })

  it('fails safely on a v1 save that does not match the v1 schema', () => {
    const raw = createValidSaveV1()
    const result = migrateSave({
      ...raw,
      progression: { ...raw.progression, anglerLevel: 0 },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
    }
  })

  it('fails safely on an unknown future schemaVersion', () => {
    const result = migrateSave({ ...createValidSaveV2(), schemaVersion: 99 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_future_version')
    }
  })

  it('fails safely on an unsupported older schemaVersion', () => {
    const result = migrateSave({ ...createValidSaveV2(), schemaVersion: 0 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_older_version')
    }
  })
})
