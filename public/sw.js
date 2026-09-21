/*
 * Phase 0B の Service Worker。
 *
 * 目的はアプリシェルを PWA として起動できるようにすることだけである。
 * オフラインでのゲームプレイキャッシュはまだ扱わない。
 * キャッシュ戦略は network-first（失敗時のみキャッシュ）で、
 * 開発中に古いビルドが残り続ける事故を避ける。
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
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/index.html'))),
  )
})
