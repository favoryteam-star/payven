// 페이븐 서비스워커 — 보수적으로: 페이지(네비게이션)는 네트워크 우선(배포 즉시 반영),
// 정적 에셋만 캐시. 오프라인이면 캐시된 셸로 폴백.
const CACHE = 'payven-shell-v1'
const SHELL = ['/']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 정적 에셋: 캐시 우선
  if (url.pathname.startsWith('/_next/static') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })),
    )
    return
  }

  // 네비게이션(HTML): 네트워크 우선 → 실패 시 캐시된 홈 셸
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')))
  }
})
