// Fair Nine moved to ../rack-it/. A phone with the old app installed still runs the old
// worker, which checks this file for updates; this version takes over, deletes Fair Nine's
// caches, unregisters itself and reloads any open window, which then shows the "moved" page
// straight from the network. It caches nothing and answers no requests.
// Only fair-nine-* caches go: the other apps share this origin and keep theirs.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("fair-nine-")).map(k => caches.delete(k)));
    await self.clients.claim();   // navigate() only works on windows this worker controls
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window" });
    windows.forEach(w => w.navigate(w.url).catch(() => {}));
  })());
});
