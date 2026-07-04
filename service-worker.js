/* Praveno Platform — service worker
   Strategy:
   - App shell (index.html, manifest, icons): cache-first precache for instant, offline load.
   - Same-origin GET data/assets: stale-while-revalidate.
   - Non-GET (mutations): passed through; the app queues writes in localStorage/IndexedDB
     and (in production) replays them via the Background Sync API when connectivity returns.
   Bump CACHE_VERSION to invalidate old caches on deploy. */
const CACHE_VERSION = "praveno-v1.0.0";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutations handled by the app's offline queue
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't cache cross-origin

  // Navigation requests: serve cached shell when offline (SPA fallback).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Stale-while-revalidate for same-origin assets.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* Background Sync placeholder — production replays queued mutations here. */
self.addEventListener("sync", (event) => {
  if (event.tag === "praveno-replay-queue") {
    event.waitUntil(Promise.resolve() /* replayQueuedMutations() */);
  }
});
