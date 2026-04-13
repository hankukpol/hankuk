/* eslint-disable no-restricted-globals */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Intentionally empty.
  // This app does not use an offline cache, but some browsers may still
  // request /sw.js due to an older localhost service worker registration.
})
