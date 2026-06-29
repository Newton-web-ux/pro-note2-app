const CACHE_NAME = "pro-document-v3";

const FILES_TO_CACHE = [
  "./",
  "./dashboard.html",
  "./manifest.json",
  "./sw.js",
  "./icon-192.png",
  "./icon-512.png"
];


self.addEventListener("install", event => {

  event.waitUntil(
    caches.open(CACHE_NAME)
    .then(cache => {

      return Promise.all(
        FILES_TO_CACHE.map(file =>
          cache.add(file).catch(err =>
            console.log("Cache failed:", file, err)
          )
        )
      );

    })
  );

  self.skipWaiting();

});


self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys => {

      return Promise.all(

        keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))

      );

    })

  );

  self.clients.claim();

});


self.addEventListener("fetch", event => {

  event.respondWith(

    caches.match(event.request)
    .then(cached => {

      return cached || fetch(event.request);

    })

  );

});
