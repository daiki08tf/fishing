import type { CurrentSave } from '../../domain/save/SaveGame'
import type { SaveRepository } from '../../domain/save/SaveRepository'

/**
 * IndexedDB による SaveRepository。ARCHITECTURE.md §2 / §3 に対応する。
 *
 * 最小実装に留める。クラウド保存・認証・同期は扱わない。
 * 1 record（キー固定）だけを読み書きする。
 *
 * 注意: この実装はブラウザ専用である。
 * Domain からは参照されず、SaveRepository interface 越しにのみ使われる。
 */

const DATABASE_NAME = 'fishing'
const DATABASE_VERSION = 1
const STORE_NAME = 'save'
const RECORD_KEY = 'current'

export class IndexedDbUnavailableError extends Error {
  constructor() {
    super('IndexedDB is not available in this environment')
    this.name = 'IndexedDbUnavailableError'
  }
}

const requestToPromise = <TResult>(request: IDBRequest<TResult>): Promise<TResult> =>
  new Promise<TResult>((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result)
    })
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    })
  })

export class IndexedDbSaveRepository implements SaveRepository {
  constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  async loadRaw(): Promise<unknown | null> {
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const result = await requestToPromise<unknown>(store.get(RECORD_KEY))
    database.close()
    return result ?? null
  }

  async save(save: CurrentSave): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await requestToPromise(store.put(save, RECORD_KEY))
    database.close()
  }

  async clear(): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await requestToPromise(store.delete(RECORD_KEY))
    database.close()
  }

  private open(): Promise<IDBDatabase> {
    const factory = this.factory

    if (factory === undefined) {
      return Promise.reject(new IndexedDbUnavailableError())
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION)

      request.addEventListener('upgradeneeded', () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME)
        }
      })

      request.addEventListener('success', () => {
        resolve(request.result)
      })

      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to open IndexedDB'))
      })
    })
  }
}
