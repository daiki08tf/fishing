import { describe, expect, it } from 'vitest'
import { createValidSaveV4 } from '../../../tests/fixtures/save'
import { InMemorySaveRepository } from './inMemorySaveRepository'
import { IndexedDbSaveRepository, IndexedDbUnavailableError } from './indexedDbSaveRepository'
import { migrateSave } from './migrateSave'

describe('InMemorySaveRepository', () => {
  it('returns null before anything is saved', async () => {
    const repository = new InMemorySaveRepository()
    await expect(repository.loadRaw()).resolves.toBeNull()
  })

  it('round-trips a save through the migration boundary', async () => {
    const repository = new InMemorySaveRepository()
    const save = createValidSaveV4()

    await repository.save(save)

    const result = migrateSave(await repository.loadRaw())
    expect(result.ok).toBe(true)
  })

  it('stores a copy, not a live reference', async () => {
    const repository = new InMemorySaveRepository()
    const save = createValidSaveV4()

    await repository.save(save)
    const loaded = await repository.loadRaw()

    expect(loaded).not.toBe(save)
    expect(loaded).toEqual(save)
  })

  it('clears the stored save', async () => {
    const repository = new InMemorySaveRepository()
    await repository.save(createValidSaveV4())
    await repository.clear()

    await expect(repository.loadRaw()).resolves.toBeNull()
  })
})

describe('IndexedDbSaveRepository', () => {
  it('fails clearly when IndexedDB is unavailable', async () => {
    // Node 環境には IndexedDB が無い。
    // ブラウザ専用であることを、暗黙の失敗ではなく明示的なエラーで示す。
    const repository = new IndexedDbSaveRepository(undefined)

    await expect(repository.loadRaw()).rejects.toBeInstanceOf(IndexedDbUnavailableError)
    await expect(repository.save(createValidSaveV4())).rejects.toBeInstanceOf(
      IndexedDbUnavailableError,
    )
    await expect(repository.clear()).rejects.toBeInstanceOf(IndexedDbUnavailableError)
  })
})
