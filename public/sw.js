importScripts('assets/workhorse/asset-manifest.js');
const CACHE = 'workhorse-v2';
const assets = [];
for (const g in self.WORKHORSE_ASSET_MANIFEST) {
  const grp = self.WORKHORSE_ASSET_MANIFEST[g];
  if (typeof grp === 'object') for (const k in grp) assets.push('assets/workhorse/' + grp[k]);
}
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/defaults.js', 'js/assets.js', 'js/core.js', 'js/share.js', 'js/app.js',
  'assets/workhorse/asset-manifest.js'].concat(assets);
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// 網路優先,離線時用快取
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
