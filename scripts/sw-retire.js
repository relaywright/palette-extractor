// The worker a build ships instead of sw.js when it is built with SW_OFF=1.
// It removes the offline worker from every browser that has it: it takes over
// at once, deletes the caches the app made, unregisters itself and reloads the
// open pages so they load straight from the network. It has no fetch handler,
// so it never answers a request.
const CACHE_PREFIX = "palette-shell-";
const SHARED = "palette-shared-image";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(CACHE_PREFIX) || name === SHARED)
          await caches.delete(name);
      await self.registration.unregister();
      // Unregistered first, so the reloaded pages are not served by a worker.
      const pages = await self.clients.matchAll({ type: "window" });
      await Promise.all(
        pages.map((page) =>
          page
            .navigate(page.url)
            .catch((error) => console.warn("A page could not reload", error)),
        ),
      );
    })(),
  );
});
