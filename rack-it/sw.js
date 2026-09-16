// Network-first shell cache. Bump CACHE whenever index.html changes so old copies are dropped.
const CACHE = "rack-it-v2.0.0";
const SHELL = ["./", "./index.html", "./zargo.js", "./manifest.json",
               "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Try the network first so a fresh deploy shows up; fall back to cache when offline.
// "no-cache" makes the browser check with the server every time (a cheap 304 when nothing
// changed) instead of trusting its own 10-minute copy, so a page never mixes a new app with
// an old shared/*.js.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
