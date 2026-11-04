// 離線快取:網路優先、失敗才用快取;只處理同網域請求。
// __BUILD__ 會在部署時換成版本號,每次部署都是新的快取,舊的自動清掉。
const CACHE = 'workhorse-__BUILD__';
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.add('./')).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then((m) => m || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
