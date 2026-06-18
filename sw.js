const CACHE_NAME = 'porra-mundial-v1';
const DYNAMIC_CACHE_NAME = 'porra-dynamic-v1';

// Static assets to precache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// Data files that should be updated frequently but cached for offline use
const DATA_ASSETS = [
  './porra_data.json',
  './results.json'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching static app shell');
      return cache.addAll(STATIC_ASSETS.concat(DATA_ASSETS));
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. Check if request is for local files (HTML, CSS, JS, JSON data files)
  const isLocalRequest = requestUrl.origin === location.origin;

  if (isLocalRequest) {
    // Strategy: Network First, falling back to Cache
    // This guarantees we always show the latest data when online,
    // and fallback to cached data/pages when offline.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Put clone of response in cache if it's a valid GET request
          if (event.request.method === 'GET' && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline, serve from cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If it's a page navigation request, return index.html fallback
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
  } else {
    // 2. External requests (Google Fonts, FontAwesome, Chart.js)
    // Strategy: Cache First, falling back to Network
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200 && event.request.method === 'GET') {
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Silence errors for analytics/external scripts if offline
            console.log('[Service Worker] Offline fetch failed for external asset:', event.request.url);
          });
      })
    );
  }
});
