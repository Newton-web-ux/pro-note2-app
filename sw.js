// Pro Document — service worker
const CACHE_NAME = 'pro-document-shell-v2'; // bumped so the old cache is deleted

// Only these rarely-changing files use cache-first.
const SHELL_ASSETS = ['./manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const isShell = SHELL_ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '/')));

  if (isShell) {
    // Icons and manifest: cache-first is fine.
    event.respondWith(caches.match(req).then((c) => c || fetch(req)));
    return;
  }

  // HTML, JS, CSS: always try the network first so updates show up.
  // Use the cache only when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
