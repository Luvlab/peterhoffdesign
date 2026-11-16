// Links service worker: makes the page installable and lets it open without a connection.
// Own files: network first, so a new version is always used when online; the saved copy is the fallback.
// three.js from the CDN: saved copy first, the URLs carry a fixed version.
const CACHE = 'links-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const own = u.origin === location.origin && (u.pathname.startsWith('/links') || u.pathname === '/phd-logo.png');
  const cdn = u.hostname === 'cdn.jsdelivr.net';
  if (!own && !cdn) return;                      // the API and everything else go straight to the network
  if (cdn) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    try { const res = await fetch(r, { cache: 'no-cache' }); if (res.ok) c.put(r, res.clone()); return res; }
    catch (err) { const hit = await c.match(r, { ignoreSearch: true }); if (hit) return hit; throw err; }
  }));
});
