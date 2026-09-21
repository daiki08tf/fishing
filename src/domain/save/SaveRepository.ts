import type { CurrentSave } from './SaveGame'

/**
 * Save 永続化の境界。ARCHITECTURE.md §3 の Infrastructure が実装する。
 *
 * この interface は Domain 側が所有する。
 * IndexedDB（または将来のクラウド保存）は実装の詳細であり、Domain は知らない。
 *
 * loadRaw が unknown を返すのは意図的である。
 * 永続化されたデータは常に「未検証の外部入力」として扱い、
 * migration / validation を通過したものだけを Domain へ渡す。
 */
export interface SaveRepository {
  /** 未検証の生データを返す。保存が無い場合は null。 */
  loadRaw(): Promise<unknown | null>

  /** 検証済みの Save を保存する。 */
  save(save: CurrentSave): Promise<void>

  /** 保存を削除する。 */
  clear(): Promise<void>
}
