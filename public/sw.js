// TeklifVer Service Worker (PWA)
const CACHE_NAME = 'teklifver-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/css/theme.css',
  '/css/style.css',
  '/js/theme.js',
  '/js/main.js',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Statik fontlar ve resimler için Cache-First
  if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/img/') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.png')) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }))
    );
    return;
  }

  // Dinamik sayfalar için Network-First, bağlantı koparsa Cache / Offline fallback
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then(cached => cached || caches.match('/')))
  );
});
