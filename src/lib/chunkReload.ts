const KEY = "chunk-reload-at";
const WINDOW_MS = 10_000;

/**
 * A tab left open across deploys can ask for a code chunk that the host, or
 * the offline copy, no longer has. Reloading once picks up the current build
 * instead of leaving a panel that never opens. A second failure soon after a
 * reload is left to surface, so a chunk that is truly missing cannot loop.
 */
export function reloadOnMissingChunk() {
  window.addEventListener("vite:preloadError", (event) => {
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < WINDOW_MS) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Without storage there is no loop guard, so do not reload.
      return;
    }
    event.preventDefault();
    location.reload();
  });
}
