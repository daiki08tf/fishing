/*
 * Phase 0B の Service Worker。
 *
 * 目的はアプリシェルを PWA として起動できるようにすることだけである。
 * オフラインでのゲームプレイキャッシュはまだ扱わない。
 * キャッシュ戦略は network-first（失敗時のみキャッシュ）で、
 * 開発中に古いビルドが残り続ける事故を避ける。
 *
 * Phase 15: Content Pack は content-hash 付き chunk として遅延ロードされる。
 * オフライン時に JS chunk の要求へ index.html を返すと「HTML を JS として読む」
 * 事故になるため、index.html へのフォールバックは navigation 要求だけに限定する
 * （hash が変わった chunk を古いキャッシュから返すことも無い）。
 */

const CACHE_NAME = 'fishing-shell-v1'
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined)
        return response
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached !== undefined) {
            return cached
          }

          // navigation 以外（chunk / JSON など）へ HTML を返さない。
          if (request.mode === 'navigate') {
            return caches.match('/index.html')
          }

          return new Response('offline', {
            status: 504,
            statusText: 'Content Pack is not cached',
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        }),
      ),
  )
})
