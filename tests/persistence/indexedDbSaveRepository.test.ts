import { describe, expect, it } from 'vitest'
import { IndexedDbSaveRepository } from '../../src/infrastructure/persistence/indexedDbSaveRepository'
import { createValidSaveV3 } from '../fixtures/save'

/**
 * IndexedDB adapter の API 形状テスト。
 *
 * 実ブラウザではなく、adapter が使う API（open / transaction / objectStore /
 * get / put / delete とイベント）だけを模した Fake で確認する。
 * 本物のブラウザ挙動（永続化・バージョン管理・障害時）は保証しない。
 */

type Listener = () => void

class FakeRequest<TResult> {
  result: TResult | undefined
  error: Error | null = null
  private readonly listeners = new Map<string, Listener[]>()

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }
}

class FakeObjectStore {
  constructor(private readonly records: Map<unknown, unknown>) {}

  get(key: unknown): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>()
    queueMicrotask(() => {
      request.result = this.records.get(key)
      request.emit('success')
    })
    return request
  }

  put(value: unknown, key: unknown): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>()
    queueMicrotask(() => {
      this.records.set(key, value)
      request.result = key
      request.emit('success')
    })
    return request
  }

  delete(key: unknown): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>()
    queueMicrotask(() => {
      this.records.delete(key)
      request.emit('success')
    })
    return request
  }
}

class FakeTransaction {
  constructor(private readonly store: FakeObjectStore) {}

  objectStore(): FakeObjectStore {
    return this.store
  }
}

class FakeDatabase {
  readonly storeNames: string[] = []

  get objectStoreNames(): { contains: (name: string) => boolean } {
    return { contains: (name: string) => this.storeNames.includes(name) }
  }

  constructor(private readonly records: Map<unknown, unknown>) {}

  createObjectStore(name: string): void {
    this.storeNames.push(name)
  }

  transaction(): FakeTransaction {
    return new FakeTransaction(new FakeObjectStore(this.records))
  }

  close(): void {
    // Fake では何もしない。
  }
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {}

class FakeIndexedDbFactory {
  private readonly databases = new Map<string, Map<unknown, unknown>>()

  open(name: string): FakeOpenRequest {
    const request = new FakeOpenRequest()
    const isNew = !this.databases.has(name)
    const records = this.databases.get(name) ?? new Map<unknown, unknown>()
    this.databases.set(name, records)

    queueMicrotask(() => {
      request.result = new FakeDatabase(records)

      if (isNew) {
        // adapter はここで object store を作る。
        request.emit('upgradeneeded')
      }

      request.emit('success')
    })

    return request
  }
}

const createRepository = (): IndexedDbSaveRepository =>
  new IndexedDbSaveRepository(new FakeIndexedDbFactory() as unknown as IDBFactory)

describe('IndexedDbSaveRepository', () => {
  it('reports no save before anything is written', async () => {
    const repository = createRepository()

    await expect(repository.loadRaw()).resolves.toBeNull()
  })

  it('round trips a save', async () => {
    const repository = createRepository()
    const save = createValidSaveV3()

    await repository.save(save)

    await expect(repository.loadRaw()).resolves.toEqual(save)
  })

  it('clears the stored save', async () => {
    const repository = createRepository()
    await repository.save(createValidSaveV3())
    await repository.clear()

    await expect(repository.loadRaw()).resolves.toBeNull()
  })

  it('keeps the data across repository instances (same database)', async () => {
    const factory = new FakeIndexedDbFactory()
    const first = new IndexedDbSaveRepository(factory as unknown as IDBFactory)
    const second = new IndexedDbSaveRepository(factory as unknown as IDBFactory)

    await first.save(createValidSaveV3())

    await expect(second.loadRaw()).resolves.toEqual(createValidSaveV3())
  })

  it('fails clearly when IndexedDB is unavailable', async () => {
    const repository = new IndexedDbSaveRepository(undefined)

    await expect(repository.loadRaw()).rejects.toThrow(/IndexedDB is not available/)
  })
})
