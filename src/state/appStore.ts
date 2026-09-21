import { create } from 'zustand'

/**
 * Application / UI state。
 *
 * ここには Domain のルールを置かない（ARCHITECTURE.md §3）。
 * Phase 0B ではアプリの起動状態と最小の画面状態のみを扱う。
 * PlayerState 全体を先に作らない（Phase 0B の非目標）。
 */

export type AppStatus = 'booting' | 'ready'

/** 実装済みの画面。Phase 4 で map / spot を追加した。 */
export const APP_SCREENS = ['home', 'map', 'spot', 'fishing', 'progression'] as const
export type AppScreen = (typeof APP_SCREENS)[number]

export type AppState = {
  readonly status: AppStatus
  readonly activeScreen: AppScreen

  setStatus(status: AppStatus): void
  setActiveScreen(screen: AppScreen): void
}

export const useAppStore = create<AppState>()((set) => ({
  status: 'booting',
  activeScreen: 'home',

  setStatus: (status) => {
    set({ status })
  },
  setActiveScreen: (activeScreen) => {
    set({ activeScreen })
  },
}))
