/** Registers the offline worker. Pages stay usable if the browser refuses. */
export function registerServiceWorker() {
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((error) => console.warn("Offline support is unavailable", error));
}
