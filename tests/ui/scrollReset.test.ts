import { describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../src/state/appStore'
import {
  installScreenScrollReset,
  resetScrollTop,
  type ActiveScreenSource,
} from '../../src/ui/nav/scrollReset'

/**
 * Phase 14.1 — 画面遷移で scroll を先頭へ戻す。
 *
 * 長い画面（MAP / CODEX / TRADE）から別の画面へ移ったとき、scrollY が残って
 * 見出しが viewport の外に出る問題への対策。実装は `installScreenScrollReset` に
 * 集約してあり、ここでは
 *   1. 純粋な reset 関数
 *   2. screen が変わったときだけ発火すること
 *   3. 実際の appStore（setActiveScreen）で発火すること
 * を確認する。
 */

const createTarget = () => ({ scrollTo: vi.fn() })

describe('resetScrollTop', () => {
  it('scrolls back to the top', () => {
    const target = createTarget()

    resetScrollTop(target)

    expect(target.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('does nothing (and does not throw) when there is no DOM', () => {
    expect(() => {
      resetScrollTop(null)
    }).not.toThrow()
  })

  it('swallows environments where scrollTo is not implemented', () => {
    const target = {
      scrollTo: () => {
        throw new Error('not implemented')
      },
    }

    expect(() => {
      resetScrollTop(target)
    }).not.toThrow()
  })
})

describe('installScreenScrollReset', () => {
  it('resets only when the top-level screen changes', () => {
    type Listener = (
      state: { readonly activeScreen: string },
      previous: { readonly activeScreen: string },
    ) => void
    const listeners: Listener[] = []
    const store: ActiveScreenSource = {
      subscribe: (next) => {
        listeners.push(next)
        return () => {
          listeners.length = 0
        }
      },
    }
    const target = createTarget()

    const unsubscribe = installScreenScrollReset(store, target)
    const emit = (screen: string, previous: string): void => {
      for (const listener of listeners) {
        listener({ activeScreen: screen }, { activeScreen: previous })
      }
    }

    emit('codex', 'home')
    expect(target.scrollTo).toHaveBeenCalledTimes(1)

    // 同じ screen での再描画（釣り中の phase 遷移など）では scroll を戻さない。
    emit('codex', 'codex')
    expect(target.scrollTo).toHaveBeenCalledTimes(1)

    emit('contacts', 'codex')
    expect(target.scrollTo).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('is wired to the real app store navigation', () => {
    const target = createTarget()
    const unsubscribe = installScreenScrollReset(useAppStore, target)

    useAppStore.getState().setActiveScreen('codex')
    expect(target.scrollTo).toHaveBeenCalledTimes(1)

    useAppStore.getState().setActiveScreen('codex')
    expect(target.scrollTo).toHaveBeenCalledTimes(1)

    useAppStore.getState().setActiveScreen('home')
    expect(target.scrollTo).toHaveBeenCalledTimes(2)

    unsubscribe()
    useAppStore.getState().setActiveScreen('map')
    expect(target.scrollTo).toHaveBeenCalledTimes(2)
  })
})
