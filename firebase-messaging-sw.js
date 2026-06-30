const CACHE_NAME = 'swamedia-cache-v16';
const SCOPE_PATH = (self.registration && self.registration.scope)
  ? new URL(self.registration.scope).pathname.replace(/\/$/, '')
  : '';
const withScope = (path) => `${SCOPE_PATH}${String(path || '/').startsWith('/') ? path : `/${path}`}` || '/';
const OFFLINE_URL = withScope('/offline.html');
const ASSETS_TO_CACHE = [
  withScope('/manifest.json'),
  OFFLINE_URL,
  withScope('/icons/favicon.svg'),
  withScope('/icons/icon-192.png')
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  
  // Cache high-value external resources to make page transitions and reloads near-instant
  const allowedExternalOrigins = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'firebasestorage.googleapis.com'
  ];
  const isAllowedExternal = allowedExternalOrigins.some(origin => url.hostname.includes(origin));

  if (url.origin !== self.location.origin && !isAllowedExternal) return;

  const scopedPathname = url.pathname.startsWith(SCOPE_PATH) ? url.pathname.slice(SCOPE_PATH.length) || '/' : url.pathname;
  if (
    scopedPathname.startsWith('/admin') ||
    scopedPathname.startsWith('/api') ||
    scopedPathname.startsWith('/security') ||
    scopedPathname.startsWith('/storage')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request));
    })
  );
});
