/* Playday service worker — cache the shell, leave Google alone. */
'use strict';

const VERSION = 'playday-v3';
const SHELL = [
  './',
  './index.html',
  './app.html',
  './hero.jpg',
  './styles.css',
  './app.js',
  './ics.js',
  './manifest.webmanifest',
  './404.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // never cache Google: auth and the Calendar API must always be live
  if (url.origin !== self.location.origin) return;
  // the generated config must never be stale
  if (url.pathname.endsWith('/config.js')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(hit => {
      if (hit) {
        // refresh in the background so the next load is current
        fetch(request).then(res => {
          if (res && res.ok) caches.open(VERSION).then(c => c.put(request, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
