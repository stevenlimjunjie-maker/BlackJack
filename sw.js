/**
 * sw.js — Service Worker
 * ─────────────────────
 * Caches the app shell for offline use.
 * Firebase Firestore handles its own offline persistence separately.
 */

const CACHE_NAME  = 'bj-score-v1';
const CACHE_URLS  = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/firebase-service.js',
  '/js/game-logic.js',
  '/js/ui.js',
  '/js/app.js',
  '/manifest.json',
  // Google Fonts cached by the browser automatically via cache headers
];

/* Install: pre-cache app shell */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* Activate: clean up old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: cache-first for app shell, network-first for Firebase */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let Firebase/CDN requests go through to network
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('cdnjs') ||
    url.hostname.includes('unpkg') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('fonts.googleapis')
  ) {
    return; // default browser handling
  }

  // Cache-first for local assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
