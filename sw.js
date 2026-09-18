/* Service worker: instant, offline-capable repeat visits.
 *
 * Strategy, deliberately asymmetric:
 *   - The page itself is NETWORK-FIRST with cache fallback. A deploy must show up on
 *     the next online load; caching the HTML first would compound GitHub Pages' own
 *     10-minute cache with ours and leave people on stale merchant data.
 *   - Static assets (link-preview image, calendar file, Leaflet from cdnjs) are
 *     CACHE-FIRST once fetched; they change rarely and are versioned by URL.
 *   - OpenStreetMap tiles, OneMap lookups and Google Analytics are NEVER cached:
 *     OSM's tile usage policy forbids it, OneMap answers change, GA must reach GA.
 *
 * Scope is this directory (/paylah-saturdays/ on the project site) because the file
 * sits at the repo root. Registration happens only over https (see index.html).
 */
const VERSION = 'paylah-v1';
const PRECACHE = ['./', './og-image.png', './paylah-saturdays.ics'];

const NEVER_CACHE = [
  'tile.openstreetmap.org',
  'onemap.gov.sg',
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NEVER_CACHE.some(host => url.hostname.endsWith(host))) return;   // straight to network

  const isPage = req.mode === 'navigate' || req.destination === 'document';
  if (isPage) {
    // Network-first: fresh data when online, the last good page when not.
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./', copy));
        return res;
      }).catch(() => caches.match('./'))
    );
    return;
  }

  const cacheable = url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com';
  if (!cacheable) return;

  // Cache-first for static assets; fill the cache on first fetch.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
