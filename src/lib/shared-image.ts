const CACHE = "palette-shared-image";
const KEY = "/shared-image";

/**
 * The photo shared into the installed app, parked by the service worker.
 * It is removed as it is read, so a reload never loads it twice. Returns
 * null when nothing is waiting or storage is unavailable.
 */
export async function takeSharedImage(): Promise<File | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE);
  const response = await cache.match(KEY);
  if (!response) return null;
  await cache.delete(KEY);
  const blob = await response.blob();
  const name = decodeURIComponent(
    response.headers.get("X-File-Name") || "Shared photo",
  );
  return new File([blob], name, { type: blob.type });
}
