// Cache version is injected at server startup — changes on every deploy,
// which causes the browser to install a fresh service worker and delete old caches.
const CACHE = '__CACHE_VERSION__';

// On install: activate immediately without waiting for old tabs to close
self.addEventListener('install', () => self.skipWaiting());

// On activate: delete every cache that isn't the current version, then claim clients
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Fetch strategy:
//   API calls  → network-only  (the JS layer has its own 60-second cache)
//   /sw.js     → network-only  (never cache the SW itself)
//   CDN assets → network-only  (external origin, skip)
//   Everything else → stale-while-revalidate:
//       serve from cache immediately if available, then update cache in background
self.addEventListener('fetch', e => {
    const { pathname, origin } = new URL(e.request.url);
    if (
        pathname.startsWith('/api/') ||
        pathname === '/sw.js' ||
        origin !== self.location.origin ||
        e.request.method !== 'GET'
    ) return;

    // ?v=-keyed asset directories are immutable: a deploy changes their URLs,
    // so a cache hit needs no background revalidation (or Cache Storage rewrite).
    const immutable = ['/css/', '/js/', '/font/', '/img/'].some(p => pathname.startsWith(p));

    e.respondWith(
        caches.open(CACHE).then(cache =>
            cache.match(e.request).then(cached => {
                if (cached && immutable) return cached; // cache-first, no revalidate
                const network = fetch(e.request).then(res => {
                    if (res.ok) cache.put(e.request, res.clone());
                    return res;
                }).catch(() => cached); // offline fallback
                return cached || network; // serve cache instantly, revalidate in background
            })
        )
    );
});
