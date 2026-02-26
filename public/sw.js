const CACHE_NAME = 'antho-v3';

// Install — cache minimal shell immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => 
      cache.addAll(['/', '/index.html', '/manifest.json', '/favicon.ico'])
        .catch(() => {}) // Don't fail install if precache fails
    )
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip: Supabase API, OAuth, external origins
  if (url.hostname.includes('supabase')) return;
  if (url.pathname.startsWith('/~oauth')) return;
  if (url.origin !== self.location.origin) return;

  // Strategy: StaleWhileRevalidate for everything
  // Serve from cache immediately, update cache in background
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          // Cache all successful same-origin responses
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Network failed — for navigation, fallback to cached index.html
          if (request.mode === 'navigate' && !cachedResponse) {
            return cache.match('/index.html');
          }
          return cachedResponse || new Response('Offline', { status: 503 });
        });

        // Return cached version immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
