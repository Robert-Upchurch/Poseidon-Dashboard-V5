/* Poseidon Dashboard service worker
   Strategy: network-first with cache fallback. Always tries the live
   network so the user gets the latest deploy automatically; falls back
   to the last-known-good cache only when offline. Activates immediately
   on install so a refresh after a deploy hands off cleanly. */

const CACHE_NAME = 'poseidon-cache-v1';
const PRECACHE = [
    './',
    'poseidon-dashboard-v6.html',
    'j1-system-dashboard.html',
    'j1-housing-finder-index.html',
    'manifest.webmanifest',
    'icon-192.svg',
    'icon-512.svg'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE).catch(() => {}))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Don't intercept Microsoft Graph, MSAL, or any cross-origin API call.
    if (url.origin !== location.origin) return;

    event.respondWith((async () => {
        try {
            const fresh = await fetch(req);
            // Cache 200-OK same-origin responses for offline fallback.
            if (fresh && fresh.status === 200) {
                const copy = fresh.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
            }
            return fresh;
        } catch (_) {
            const cached = await caches.match(req);
            if (cached) return cached;
            // Offline navigation fallback to the V6 dashboard if cached.
            if (req.mode === 'navigate') {
                const fallback = await caches.match('poseidon-dashboard-v6.html');
                if (fallback) return fallback;
            }
            return new Response('Offline and not cached.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
    })());
});

// Listen for an update message from the page.
self.addEventListener('message', event => {
    if (event.data === 'CHECK_UPDATE') {
        self.registration.update().catch(() => {});
    }
});
