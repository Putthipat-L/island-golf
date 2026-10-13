// Island Golf service worker: lets the home-screen app open offline after the first visit.
// The game page is always fetched fresh when online (so a new push shows up right away);
// three.js and font files never change at their URLs, so they come from the cache.
const CACHE = 'island-golf-v1';
const CORE = ['./island-golf.html', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const keep = res => res && (res.ok || res.type === 'opaque');
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const immutable = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com';
  if (immutable) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (keep(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  } else if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(fetch(req).then(res => {
      if (keep(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('./island-golf.html') : undefined))
      .then(hit => hit || Response.error())));
  }
});
