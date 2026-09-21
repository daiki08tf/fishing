/**
 * PWA のアプリシェルのみを扱う Service Worker 登録。
 *
 * オフラインのゲームプレイキャッシュはまだ作らない（Phase 0B の非目標）。
 * 本番ビルドでのみ登録し、開発中のキャッシュ事故を避ける。
 */
export const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      // 登録失敗はアプリの動作を妨げないため、警告に留める。
      console.warn(`service worker registration failed: ${message}`)
    })
  })
}
