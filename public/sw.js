// Offline cache for MK CAD. Network first for pages (so updates arrive), cache first for hashed assets and wasm.
const C = 'mkcad-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const page = r.mode === 'navigate';
  e.respondWith(page
    ? fetch(r).then((x) => { const c = x.clone(); caches.open(C).then((k) => k.put(r, c)); return x; }).catch(() => caches.match(r).then((m) => m || caches.match('./')))
    : caches.match(r).then((m) => m || fetch(r).then((x) => { if (x.ok) { const c = x.clone(); caches.open(C).then((k) => k.put(r, c)); } return x; })));
});
