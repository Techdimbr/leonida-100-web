const CACHE_NAME = 'leonida-tactical-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/style.css',
  './js/i18n.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/cover_twilight.jpg',
  './img/banner_vice.jpg',
  './img/banner_heist.jpg',
  './data/checklist_pt.json',
  './data/checklist_en.json',
  './data/economy_routes.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
