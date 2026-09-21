import type { CurrentSave } from '../../domain/save/SaveGame'
import type { SaveRepository } from '../../domain/save/SaveRepository'

/**
 * メモリ上の SaveRepository。
 *
 * テストと、IndexedDB が使えない環境でのフォールバックに使う。
 * Domain はこの実装を知らない。
 */
export class InMemorySaveRepository implements SaveRepository {
  private stored: unknown = null

  loadRaw(): Promise<unknown | null> {
    return Promise.resolve(this.stored)
  }

  save(save: CurrentSave): Promise<void> {
    // 永続化実装と同じく「値のコピーを保存する」挙動にする。
    this.stored = structuredClone(save)
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.stored = null
    return Promise.resolve()
  }
}
