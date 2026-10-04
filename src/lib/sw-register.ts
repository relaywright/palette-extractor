/** Registers the offline worker. Pages stay usable if the browser refuses. */
export function registerServiceWorker() {
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((error) => console.warn("Offline support is unavailable", error));
}

/** Removes any worker an earlier visit registered, and what it saved. */
export async function retireServiceWorkers() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((entry) => entry.unregister()));
    for (const name of await caches.keys())
      if (name.startsWith("palette-shell-") || name === "palette-shared-image")
        await caches.delete(name);
  } catch (error) {
    console.warn("The offline worker could not be removed", error);
  }
}
