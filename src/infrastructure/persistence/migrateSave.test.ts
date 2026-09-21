import { describe, expect, it } from 'vitest'
import { createValidSaveV1 } from '../../../tests/fixtures/save'
import { migrateSave } from './migrateSave'

describe('migrateSave', () => {
  it('loads a valid v1 save', () => {
    const raw = createValidSaveV1()
    const result = migrateSave(raw)

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.migratedFrom).toBe(1)
      expect(result.save.schemaVersion).toBe(1)
      expect(result.save.progression.anglerLevel).toBe(1)
    }
  })

  it('is deterministic for the same input', () => {
    const raw = createValidSaveV1()
    expect(migrateSave(raw)).toEqual(migrateSave(raw))
  })

  it('does not mutate the input', () => {
    const raw = createValidSaveV1()
    const snapshot = structuredClone(raw)
    migrateSave(raw)
    expect(raw).toEqual(snapshot)
  })

  it('fails safely when schemaVersion is missing', () => {
    const withoutVersion: Record<string, unknown> = { ...createValidSaveV1() }
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
    const raw = createValidSaveV1()
    const malformed = {
      ...raw,
      progression: { ...raw.progression, anglerLevel: 'one' },
    }

    const result = migrateSave(malformed)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
      expect(result.issues.some((issue) => issue.path === 'progression.anglerLevel')).toBe(true)
    }
  })

  it('rejects unknown extra fields', () => {
    const result = migrateSave({ ...createValidSaveV1(), futureField: true })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_save')
    }
  })

  it('fails safely on an unknown future schemaVersion', () => {
    const result = migrateSave({ ...createValidSaveV1(), schemaVersion: 99 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_future_version')
    }
  })

  it('fails safely on an unsupported older schemaVersion', () => {
    const result = migrateSave({ ...createValidSaveV1(), schemaVersion: 0 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_older_version')
    }
  })
})
