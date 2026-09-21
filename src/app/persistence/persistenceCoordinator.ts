import type { SaveRepository } from '../../domain/save/SaveRepository'
import { migrateSave } from '../../infrastructure/persistence/migrateSave'
import { createInitialSave } from '../../infrastructure/persistence/saveFactory'
import type { SaveGameV4 } from '../../domain/save/SaveGame'
import type { HydrationStatus, PlayerStoreState } from '../../state/playerStore'

/**
 * Save / Load の配線（Application 層）。
 *
 *   SaveRepository → Persistence Coordinator → Store
 *
 * - Store も Domain も IndexedDB を知らない。
 * - Domain に永続化処理を足さない（migration と組み立ては既存のものを使う）。
 *
 * 起動時:
 *   beginHydration → loadRaw → migrateSave → hydrateFromSave
 *   （Save が無ければ初期状態のまま ready、壊れていれば error）
 *
 * 以降:
 *   Store の保存対象 slice（progression / codex）が変わったら保存する。
 *   ただし **hydration が完了するまでは絶対に書かない**。
 *   （初期状態で既存 Save を上書きしてしまう事故を防ぐ）
 *
 * 補足: hydration 直後にも 1 回保存が走る（読み込みで確定した内容を書き戻す）。
 * これにより v1 から移行した Save や、欠落を正規化した Save が確定する。
 * 書き込まれるのは必ず「読み込んだ状態」であり、初期状態ではない。
 */

/**
 * ストアのうち coordinator が使う部分だけを要求する。
 * 操作（hydration 用の action）は state 側にあるので getState() 経由で呼ぶ。
 */
export type PlayerStoreApi = {
  getState(): PlayerStoreState
  subscribe(listener: (state: PlayerStoreState, previous: PlayerStoreState) => void): () => void
}

export type PersistenceCoordinatorOptions = {
  readonly repository: SaveRepository
  readonly store: PlayerStoreApi
  /** 現在時刻。Domain は時計を持たないので Application が渡す。 */
  readonly now?: () => string
  /**
   * 保存をまとめる時間（ms）。既定は 0（変更のたびにすぐ保存）。
   * 釣果直後のデータを失わないことを優先している。
   */
  readonly debounceMs?: number
}

export type PersistenceCoordinator = {
  readonly start: () => Promise<HydrationStatus>
  readonly stop: () => void
  /** 進行中の保存と、待機中の保存を消化する（テストと終了時用）。 */
  readonly flush: () => Promise<void>
  readonly lastSaveError: () => string | null
  /** 保存対象が変わってから保存が完了するまでの間だけ true。 */
  readonly isDirty: () => boolean
}

export const createPersistenceCoordinator = (
  options: PersistenceCoordinatorOptions,
): PersistenceCoordinator => {
  const { repository, store } = options
  const now = options.now ?? ((): string => new Date().toISOString())
  const debounceMs = options.debounceMs ?? 0

  /** 読み込んだ Save。自分が持たないブロック（career / finance / knowledge）を保つために使う。 */
  let baseSave: SaveGameV4 | null = null
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let activeSave: Promise<void> | null = null
  let again = false
  let dirty = false
  let lastSaveError: string | null = null
  let stopped = false

  const writeOnce = async (): Promise<void> => {
    // hydration 前は書かない（既存 Save を初期状態で壊さないため）。
    if (store.getState().hydrationStatus !== 'ready') {
      return
    }

    const state = store.getState()
    const base = baseSave ?? createInitialSave({ now: now() })
    const save: SaveGameV4 = {
      // career は、まだ所有者がいないので読み込んだ値を保つ。
      ...base,
      updatedAt: now(),
      progression: state.progression,
      codex: state.codex,
      world: state.world,
      knowledge: state.knowledge,
      finance: state.finance,
      purchases: state.purchases,
    }

    try {
      await repository.save(save)
      baseSave = save
      lastSaveError = null
    } catch (error) {
      // 保存失敗でアプリを落とさない。次の変更で再試行する。
      lastSaveError = error instanceof Error ? error.message : String(error)
    }
  }

  const requestSave = (): Promise<void> => {
    if (activeSave !== null) {
      again = true
      return activeSave
    }

    const run = (async (): Promise<void> => {
      await writeOnce()

      while (again && !stopped) {
        again = false
        await writeOnce()
      }
    })().finally(() => {
      activeSave = null
    })

    activeSave = run
    return run
  }

  const scheduleSave = (): void => {
    dirty = true

    if (debounceMs <= 0) {
      void requestSave()
      return
    }

    if (timer !== null) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      timer = null
      void requestSave()
    }, debounceMs)
  }

  const subscribe = (): void => {
    if (unsubscribe !== null) {
      return
    }

    unsubscribe = store.subscribe((state, previous) => {
      if (state.hydrationStatus !== 'ready') {
        return
      }

      if (
        state.progression === previous.progression &&
        state.codex === previous.codex &&
        state.world === previous.world &&
        state.knowledge === previous.knowledge &&
        state.finance === previous.finance &&
        state.purchases === previous.purchases
      ) {
        return
      }

      scheduleSave()
    })
  }

  const start = async (): Promise<HydrationStatus> => {
    subscribe()
    store.getState().beginHydration()

    let raw: unknown

    try {
      raw = await repository.loadRaw()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.getState().failHydration({ reason: 'storage_unavailable', message })
      return 'error'
    }

    if (raw === null || raw === undefined) {
      // 保存が無い場合は新規状態で開始する。ここでは何も書かない。
      baseSave = null
      store.getState().completeHydrationWithoutSave()
      return 'ready'
    }

    const result = migrateSave(raw)

    if (!result.ok) {
      // 壊れた Save は正常扱いしない。ただし上書きもしない。
      store.getState().failHydration({
        reason: 'invalid_save',
        message: `${result.reason}: ${result.message}`,
      })
      return 'error'
    }

    baseSave = result.save
    store.getState().hydrateFromSave(result.save)
    return 'ready'
  }

  const flush = async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    if (dirty || activeSave !== null) {
      dirty = false
      await requestSave()
    }

    while (activeSave !== null) {
      await activeSave
    }
  }

  const stop = (): void => {
    stopped = true

    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    unsubscribe?.()
    unsubscribe = null
  }

  return {
    start,
    stop,
    flush,
    lastSaveError: () => lastSaveError,
    isDirty: () => dirty || activeSave !== null,
  }
}
