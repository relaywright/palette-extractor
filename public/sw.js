// Offline support. Pages load network-first so a new deploy shows up on the
// next online visit; hashed build files and static media load cache-first.
// Bump VERSION to drop every cache this worker created earlier.
const VERSION = "v1";
const SHELL = `palette-shell-${VERSION}`;
const SHARED = "palette-shared-image";
const SHARED_KEY = "/shared-image";
const SHARE_TARGET = "/share-target";
const NAVIGATION_TIMEOUT_MS = 4000;
// Each deploy brings new hashed build files; the oldest go first.
const MAX_BUILD_FILES = 48;

const CACHE_FIRST =
  /^\/(assets|samples|fonts)\/|^\/(icon-\d+|apple-touch-icon)\.png$/;
const ICONS = ["/icon-192.png", "/icon-512.png"];

// The page references its files by root-relative path. Build output names its
// lazy chunks, worker, images and fonts inside the scripts and styles, so
// those are read too ("./Chunk.js" sits beside the script that imports it).
const PAGE_FILES = /(?:href|src)="(\/[^"?#]+)"/g;
const NAMED_FILES =
  /(?:\.\/|\/?assets\/|\/samples\/|\/fonts\/)[\w.-]+\.(?:js|css|svg|webp|png|woff2)/g;

function resolveNamed(match) {
  if (match.startsWith("./")) return "/assets/" + match.slice(2);
  return match.startsWith("/") ? match : "/" + match;
}

async function crawl(cache, start) {
  const seen = new Set(start);
  const queue = start.filter((url) => /\.(?:js|css)$/.test(url));
  while (queue.length) {
    const url = queue.pop();
    const response = await fetch(url);
    if (!response.ok) continue;
    await cache.put(url, response.clone());
    for (const match of (await response.text()).matchAll(NAMED_FILES)) {
      const file = resolveNamed(match[0]);
      if (seen.has(file)) continue;
      seen.add(file);
      if (/\.(?:js|css)$/.test(file)) queue.push(file);
    }
  }
  return [...seen];
}

async function precache() {
  const cache = await caches.open(SHELL);
  const page = await fetch("/", { cache: "reload" });
  if (!page.ok) throw new Error("The app shell could not be fetched.");
  await cache.put("/", page.clone());
  const referenced = [...(await page.text()).matchAll(PAGE_FILES)].map(
    (match) => match[1],
  );
  const files = await crawl(cache, [
    ...new Set([...referenced.filter((url) => CACHE_FIRST.test(url)), ...ICONS]),
  ]);
  // Only the shell must succeed; a missing extra never blocks installing.
  await Promise.all(
    files.map(async (url) => {
      if (await cache.match(url)) return;
      try {
        await cache.add(url);
      } catch (error) {
        console.warn("Skipped caching", url, error);
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("palette-shell-") && name !== SHELL)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

// Each page is saved under its own path (the app and the explainer are
// separate pages); a query such as ?shared=1 does not make a new copy.
function pageKey(url) {
  const path = new URL(url).pathname;
  return path === "/index.html" ? "/" : path;
}

async function openPage(event) {
  const cache = await caches.open(SHELL);
  const key = pageKey(event.request.url);
  const update = fetch(event.request).then((response) => {
    if (response.ok && !response.redirected) cache.put(key, response.clone());
    return response;
  });
  // The update keeps running after a slow network hands over to the cache.
  event.waitUntil(update.catch(() => undefined));
  const timeout = new Promise((resolve) =>
    setTimeout(resolve, NAVIGATION_TIMEOUT_MS, null),
  );
  try {
    const first = await Promise.race([update, timeout]);
    if (first) return first;
  } catch (error) {
    console.warn("Page request failed, using the saved copy", error);
  }
  return (await cache.match(key)) ?? (await cache.match("/")) ?? update;
}

async function trimBuildFiles(cache) {
  const saved = (await cache.keys()).filter((request) =>
    new URL(request.url).pathname.startsWith("/assets/"),
  );
  await Promise.all(
    saved.slice(0, Math.max(0, saved.length - MAX_BUILD_FILES)).map((request) =>
      cache.delete(request),
    ),
  );
}

async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok)
    event.waitUntil(
      cache.put(request, response.clone()).then(() => trimBuildFiles(cache)),
    );
  return response;
}

// Android's share sheet posts the photo here. It is parked in Cache Storage
// and the app is opened to pick it up.
async function takeShare(request) {
  try {
    const file = (await request.formData()).get("image");
    if (file instanceof File) {
      const cache = await caches.open(SHARED);
      await cache.put(
        SHARED_KEY,
        new Response(file, {
          headers: {
            "Content-Type": file.type,
            "X-File-Name": encodeURIComponent(file.name),
          },
        }),
      );
    }
  } catch (error) {
    console.warn("The shared image could not be saved", error);
  }
  return Response.redirect("/?shared=1", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.pathname === SHARE_TARGET) {
    event.respondWith(takeShare(request));
    return;
  }
  if (request.method !== "GET") return;
  if (request.mode === "navigate") event.respondWith(openPage(event));
  else if (CACHE_FIRST.test(url.pathname))
    event.respondWith(cacheFirst(event));
});
