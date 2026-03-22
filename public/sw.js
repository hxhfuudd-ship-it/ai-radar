const CACHE_NAME = 'ai-radar-v3';
const DEV_HOSTS = new Set(['localhost', '127.0.0.1']);
const DISABLE_IN_DEV = DEV_HOSTS.has(self.location.hostname);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  if (DISABLE_IN_DEV) {
    event.waitUntil(
      caches.keys().then(async (keys) => {
        await Promise.all(keys.filter((k) => k.startsWith('ai-radar-')).map((k) => caches.delete(k)));
        await self.registration.unregister();
      })
    );
    return;
  }

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (DISABLE_IN_DEV) return;

  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache: API routes, dynamic pages, HTML navigation
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/project/') ||
    request.mode === 'navigate'
  ) return;

  // Cache-first for static assets (_next/static)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else (icons, manifest, etc.)
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
