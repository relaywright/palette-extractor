// Offline support. Each build writes its own copy of this file with a
// revision and the complete list of files its pages use (scripts/sw-build.mjs),
// so a deploy always installs a new worker. Installing saves every file under
// that revision and only succeeds when all of them arrive: until then the
// previous worker keeps serving a consistent older version.
//
// Pages load network-first, so a new deploy shows up on the next online visit.
// Offline, each page comes from the copy saved by the worker that matches it,
// which is why a saved page never names a file that is not saved too.
const REVISION = "development";
const PAGES = [];
const FILES = [];

const CACHE_PREFIX = "palette-shell-";
const SHELL = CACHE_PREFIX + REVISION;
const SHARED = "palette-shared-image";
const SHARED_KEY = "/shared-image";
const SHARE_TARGET = "/share-target";
const NAVIGATION_TIMEOUT_MS = 4000;
const SAVED_FILES = new Set(FILES);

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline</title>
<style>
body{margin:0;display:grid;min-height:100vh;place-items:center;background:#16191b;color:#e8e7e2;font:16px/1.5 system-ui,sans-serif}
main{max-width:30rem;padding:24px}
a{color:#e1c6a4}
</style>
</head>
<body>
<main>
<h1>You are offline</h1>
<p>This page was not saved for offline use. Reconnect to open it, or <a href="/">go to the palette tool</a>.</p>
</main>
</body>
</html>`;

// A redirected response cannot answer a navigation, so a saved page is
// always a plain copy.
async function plainCopy(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// A page must name only files this revision saves. A deploy that lands
// between the worker's download and its page request would otherwise save a
// page that points at files the offline copy lacks.
function checkPageFiles(page, html) {
  for (const [, url] of html.matchAll(/(?:href|src)="(\/assets\/[^"?#]+)"/g))
    if (!SAVED_FILES.has(url))
      throw new Error(`${page} uses ${url}, which this build does not list.`);
}

async function precache() {
  // Only a cache this install creates is its own to remove: an existing one
  // with the same name is still what the active worker serves.
  const created = !(await caches.has(SHELL));
  const cache = await caches.open(SHELL);
  try {
    await Promise.all([
      ...PAGES.map(async (page) => {
        const response = await fetch(page, { cache: "reload" });
        if (!response.ok)
          throw new Error(`${page} answered ${response.status}`);
        checkPageFiles(page, await response.clone().text());
        await cache.put(page, await plainCopy(response));
      }),
      ...FILES.map(async (url) => {
        const response = await fetch(url, { cache: "reload" });
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        await cache.put(url, response);
      }),
    ]);
  } catch (error) {
    // Never leave a half-saved revision behind.
    if (created) await caches.delete(SHELL);
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(CACHE_PREFIX) && name !== SHELL)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

// Each page is saved under its own path (the app and the explainer are
// separate pages); a query such as ?shared=1 does not make a new copy. The
// host may serve the explainer as /how, so that reads as the same page.
function pageKey(url) {
  const path = new URL(url).pathname;
  if (path === "/index.html") return "/";
  if (path === "/how" || path === "/how/") return "/how.html";
  return path;
}

async function openPage(request) {
  const key = pageKey(request.url);
  // "no-cache" revalidates with the server, so the browser's own HTTP cache
  // never hands back an older deploy of the page.
  const update = fetch(request, { cache: "no-cache" });
  void update.catch(() => null);
  const timeout = new Promise((resolve) =>
    setTimeout(resolve, NAVIGATION_TIMEOUT_MS, null),
  );
  let network;
  try {
    network = await Promise.race([update, timeout]);
  } catch (error) {
    console.warn("Page request failed, using the saved copy", error);
    network = undefined;
  }
  if (network && network.status < 500) return network;
  const saved = await (await caches.open(SHELL)).match(key);
  if (saved) return saved;
  if (network) return network;
  // A slow network with nothing saved is worth waiting for.
  if (network === null) {
    try {
      return await update;
    } catch (error) {
      console.warn("Page request failed and nothing is saved", error);
    }
  }
  return new Response(OFFLINE_PAGE, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function savedFile(request) {
  const cache = await caches.open(SHELL);
  // Module scripts and stylesheets are requested with CORS, so they send an
  // Origin header the saved copies were fetched without. A server that answers
  // "Vary: Origin" would make every one of them a miss; these files are named
  // by their content or never change, so Vary has nothing to say about them.
  return (await cache.match(request, { ignoreVary: true })) ?? fetch(request);
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
  if (request.mode === "navigate") event.respondWith(openPage(request));
  else if (SAVED_FILES.has(url.pathname)) event.respondWith(savedFile(request));
});
