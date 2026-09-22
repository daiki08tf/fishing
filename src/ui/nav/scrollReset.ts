/**
 * 画面遷移時の scroll reset（Phase 14.1）。
 *
 * 長い画面（MAP / CODEX / TRADE）から別の画面へ移ると scrollY が残り、
 * 次の画面の見出しが viewport の外に出てしまう問題をここだけで解決する。
 *
 * 方針:
 * - 対象は **top-level screen の切り替えだけ**（BottomNav / 内部リンク / 戻る すべて
 *   `setActiveScreen` を通るので、AppShell で 1 箇所だけ購読する）。
 * - 釣り中の phase 遷移（CAST → WAITING → …）は screen が変わらないので reset しない。
 * - 各画面が個別に window.scrollTo を呼ばない（散らばると「しない画面」との差が出る）。
 *
 * DOM を知らない層（state / domain）には持ち込まない。UI 層のこのモジュールが
 * appStore を購読するだけにしてある。
 */

/** scroll を戻す対象（テストで差し替えられるように最小の形だけ要求する）。 */
export type ScrollTarget = {
  scrollTo(x: number, y: number): void
}

/** 画面の切り替えを持つ Store（appStore の最小の形）。 */
export type ActiveScreenSource = {
  subscribe(
    listener: (
      state: { readonly activeScreen: string },
      previous: { readonly activeScreen: string },
    ) => void,
  ): () => void
}

/** 実行環境の scroll 対象。SSR / テスト（DOM なし）では null。 */
export const resolveScrollTarget = (): ScrollTarget | null =>
  typeof window === 'undefined' ? null : window

/** 先頭へ戻す。未実装環境（jsdom 等）でも落とさない。 */
export const resetScrollTop = (target: ScrollTarget | null = resolveScrollTarget()): void => {
  if (target === null) {
    return
  }

  try {
    target.scrollTo(0, 0)
  } catch {
    // scroll できない環境（テスト用 DOM 等）では何もしない。
  }
}

/**
 * screen が変わったときだけ scroll を戻す購読を 1 つだけ張る。
 * 戻り値は解除関数（テストと HMR 用）。
 */
export const installScreenScrollReset = (
  store: ActiveScreenSource,
  target: ScrollTarget | null = resolveScrollTarget(),
): (() => void) =>
  store.subscribe((state, previous) => {
    if (state.activeScreen !== previous.activeScreen) {
      resetScrollTop(target)
    }
  })
