/**
 * Service worker: makes the app work with no network at all once installed.
 *
 * App shell is precached and served cache-first (it only changes when the
 * version below changes); everything else falls back to the network.
 */

const VERSION = 'v1';
const CACHE = `flashcards-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/ui.js',
  'js/icons.js',
  'js/theme.js',
  'js/fsrs.js',
  'js/scheduler.js',
  'js/store.js',
  'js/stats.js',
  'js/settings.js',
  'js/charts.js',
  'js/deckfile.js',
  'js/prompt.js',
  'js/skillfile.js',
  'js/skillfile-util.js',
  'js/views/decks.js',
  'js/views/deck.js',
  'js/views/study.js',
  'js/views/stats.js',
  'js/views/settings.js',
  'decks/FSRS_AND_STUDY.deck',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any single file 404s, so add
      // them individually and tolerate misses.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Refresh in the background so the next launch gets the new version.
        event.waitUntil(
          fetch(request)
            .then((res) => res.ok && caches.open(CACHE).then((c) => c.put(request, res.clone())))
            .catch(() => null)
        );
        return cached;
      }
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
