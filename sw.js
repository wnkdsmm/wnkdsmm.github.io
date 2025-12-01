const CACHE_NAME = 'site-cache-v1';
const OFFLINE_URL = '/offline.html';
const TIMEOUT = 400;

// Статические ресурсы для кэширования при установке
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png'
];

// --- ДОБАВЛЕНО: функция сетевого запроса с таймаутом ---
function fromNetwork(request, timeout) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('timeout')), timeout);

    fetch(request).then(response => {
      clearTimeout(timeoutId);
      resolve(response);
    }, reject);
  });
}

// --- ДОБАВЛЕНО: получение из кэша (fallback) ---
function fromCache(request) {
  return caches.open(CACHE_NAME)
    .then(cache => cache.match(request))
    .then(matching => matching || Promise.reject('no-match'));
}

// Установка Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Обработка fetch запросов
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('chrome-extension://') === 0) return;

  // --- ДОБАВЛЕНО: схема "сетевой запрос с таймаутом → кэш" ---
  event.respondWith(
    fromNetwork(event.request, TIMEOUT)
      .then((response) => {
        // Кэшируем успешный ответ
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => {
        // Если сеть недоступна — ищем в кэше
        return fromCache(event.request)
          .catch(() => {
            // Если это HTML — выдаём offline.html
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }

            // Иначе fallback
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
