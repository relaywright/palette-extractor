import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { imageSize, ready } from "./helpers";
import { hexes } from "./touch-checks";
import { writeServiceWorker } from "../scripts/sw-build.mjs";

// Every spec here runs against the production build, where the service
// worker is registered.

const worker = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return true;
  });

test("a second load with the network off renders the app and extracts the sample", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await worker(page);
  await context.setOffline(true);
  await page.goto("/");
  // Offline pages read everything from storage, which a busy machine can slow.
  await expect(page.locator("#workspace")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 20000 },
  );
  await expect(page.locator(".swatch")).toHaveCount(6);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Golden dunes",
  );
  // The offline page can still run its tools, which load their own chunks.
  await page.getByRole("button", { name: "More colors" }).click();
  await ready(page);
  await expect(page.locator(".swatch")).toHaveCount(7);
});

test("visiting the explainer never replaces the app's saved page", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await worker(page);
  await page.goto("/how.html");
  await expect(page).toHaveTitle(/How median cut works/);
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.locator("#workspace")).toBeAttached({ timeout: 20000 });
  await expect(page).not.toHaveTitle(/How median cut works/);
});

test("the saved copy holds the shell, the worker, lazy chunks, fonts and samples", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await worker(page);
  const saved = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    return urls;
  });
  for (const expected of [
    /^\/$/,
    /^\/assets\/index-.*\.js$/,
    /^\/assets\/index-.*\.css$/,
    /^\/assets\/quantize\.worker-.*\.js$/,
    /^\/assets\/Stage-.*\.js$/,
    /^\/assets\/ExportPanel-.*\.js$/,
    /^\/samples\/namib\.webp$/,
    /^\/samples\/fern\.webp$/,
    /^\/fonts\/schibsted-latin\.woff2$/,
    /^\/fonts\/spline-latin\.woff2$/,
    /^\/icon-512\.png$/,
  ])
    expect(
      saved.some((url) => expected.test(url)),
      String(expected),
    ).toBe(true);
});

test("the service worker controls the page after a reload", async ({
  page,
}) => {
  await page.goto("/");
  await worker(page);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toMatch(/\/sw\.js$/);
});

test("the manifest has what installing needs", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const response = await page.request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.start_url).toBe("/");
  expect(["standalone", "fullscreen", "minimal-ui"]).toContain(
    manifest.display,
  );
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  const sizes: number[] = [];
  for (const icon of manifest.icons) {
    const file = await page.request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()["content-type"], icon.src).toMatch(/^image\//);
    expect(icon.type).toBe(file.headers()["content-type"]);
    const { width, height } = imageSize(Buffer.from(await file.body()));
    expect(icon.sizes).toBe(`${width}x${height}`);
    sizes.push(width);
  }
  expect(sizes).toEqual(expect.arrayContaining([192, 512]));
  expect(manifest.share_target).toMatchObject({
    action: "/share-target",
    method: "POST",
    enctype: "multipart/form-data",
  });
  expect(manifest.share_target.params.files).toEqual([
    { name: "image", accept: ["image/*"] },
  ]);
});

test("the server sends the worker script without long caching", async () => {
  const headers = readFileSync("public/_headers", "utf8");
  expect(headers).toMatch(/^\/sw\.js\s*\n\s+Cache-Control: no-cache$/m);
});

test("a photo shared into the app opens as the image and is not kept", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await worker(page);
  await page.reload();
  await ready(page);
  // The share sheet sends a multipart POST; a form submit does the same.
  await Promise.all([
    page.waitForURL(/\/\?shared=1|\/$/),
    page.evaluate(() => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/share-target";
      form.enctype = "multipart/form-data";
      const input = document.createElement("input");
      input.type = "file";
      input.name = "image";
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#2a9d8f"/></svg>',
          ],
          "from-gallery.svg",
          { type: "image/svg+xml" },
        ),
      );
      input.files = transfer.files;
      form.append(input);
      document.body.append(form);
      form.submit();
    }),
  ]);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "from-gallery.svg",
  );
  await ready(page);
  expect(new URL(page.url()).search).toBe("");
  const left = await page.evaluate(
    async () =>
      (await (await caches.open("palette-shared-image")).keys()).length,
  );
  expect(left).toBe(0);
});

test.describe("against a site that deploys a new version", () => {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
  };
  let server: Server;
  let version = "one";
  let origin = "";

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const path = new URL(req.url!, "http://x").pathname;
      const file = join("dist", path.replaceAll("..", ""));
      const target = statSync(file, { throwIfNoEntry: false })?.isFile()
        ? file
        : join("dist", "index.html");
      let body: Buffer | string = readFileSync(target);
      if (target.endsWith("index.html"))
        body = body.toString().replace("<head>", `<head><!-- ${version} -->`);
      res.writeHead(200, {
        "Content-Type": types[extname(target)] ?? "application/octet-stream",
        "Cache-Control": "max-age=3600",
        // Some servers vary on Origin; module scripts send one, the saved
        // copies were fetched without.
        Vary: "Origin",
      });
      res.end(body);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
  });
  test.afterAll(() => new Promise((resolve) => server.close(resolve)));

  test("a script is found offline when the server varies on Origin", async ({
    page,
    context,
  }) => {
    version = "one";
    await page.goto(origin);
    await ready(page);
    await worker(page);
    const chunk = await page.evaluate(async () => {
      // The saved copy is named after the build it belongs to.
      const shell = (await caches.keys()).find((name) =>
        name.startsWith("palette-shell-"),
      );
      if (!shell) return undefined;
      const keys = await (await caches.open(shell)).keys();
      return keys
        .map((request) => new URL(request.url).pathname)
        .find((path) => /^\/assets\/ExportPanel-.*\.js$/.test(path));
    });
    expect(chunk).toBeTruthy();
    await context.setOffline(true);
    // A module import is a CORS request, so it carries an Origin header that
    // the saved copy was fetched without.
    const loaded = await page.evaluate(async (path) => {
      try {
        await new Function("path", "return import(path)")(path);
        return true;
      } catch {
        return false;
      }
    }, chunk);
    expect(loaded).toBe(true);
  });

  test("the next online load shows it, even with the old page saved", async ({
    page,
  }) => {
    version = "one";
    await page.goto(origin);
    await ready(page);
    await worker(page);
    await page.reload();
    expect(await page.content()).toContain("<!-- one -->");
    version = "two";
    await page.reload();
    await ready(page);
    expect(await page.content()).toContain("<!-- two -->");
  });
});

test("a shared photo that arrives late does not replace a sample chosen meanwhile", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate(async () => {
    const cache = await caches.open("palette-shared-image");
    await cache.put(
      "/shared-image",
      new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#2a9d8f"/></svg>',
        {
          headers: {
            "Content-Type": "image/svg+xml",
            "X-File-Name": "late-share.svg",
          },
        },
      ),
    );
  });
  // Reading the parked photo takes a while, as it can on a busy phone.
  await page.addInitScript(() => {
    if (!location.search.includes("shared")) return;
    const match = Cache.prototype.match;
    Cache.prototype.match = async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return match.apply(this, args);
    };
  });
  await page.goto("/?shared=1");
  await page.getByRole("button", { name: "Try Forest floor" }).click();
  await ready(page);
  await page.waitForTimeout(2500);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Forest floor",
  );
});

/**
 * A copy of the built site standing in for one deploy. The entry script and
 * the lazily loaded Export panel are renamed for `build`, as a new deploy's
 * content hashes would rename them, and the panel records `build` on the page
 * when it loads. The worker is regenerated the way the real build does it.
 */
function deploy(build: string) {
  const dir = mkdtempSync(join(tmpdir(), `deploy-${build}-`));
  cpSync(resolve("dist"), dir, { recursive: true });
  const assets = join(dir, "assets");
  const renames = [/^main-.*\.js$/, /^ExportPanel-.*\.js$/].map((pattern) => {
    const old = readdirSync(assets).find((name) => pattern.test(name))!;
    const next = old.replace(/-[^.]+\.js$/, `-${build}.js`);
    renameSync(join(assets, old), join(assets, next));
    return [old, next];
  });
  const textFiles = (folder: string): string[] =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? textFiles(join(folder, entry.name))
        : /\.(js|css|html|json)$/.test(entry.name)
          ? [join(folder, entry.name)]
          : [],
    );
  for (const file of textFiles(dir)) {
    let text = readFileSync(file, "utf8");
    for (const [old, next] of renames) text = text.replaceAll(old, next);
    writeFileSync(file, text);
  }
  const panel = join(assets, renames[1][1]);
  writeFileSync(
    panel,
    `${readFileSync(panel, "utf8")}\ndocument.documentElement.dataset.build=${JSON.stringify(build)};\n`,
  );
  writeServiceWorker(dir, resolve("public/sw.js"));
  return dir;
}

test.describe("across two different deploys", () => {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
  };
  const dirs: Record<string, string> = {};
  let server: Server;
  let origin = "";
  let current = "one";
  // Paths the site stops serving, to model a deploy that is only half there.
  let missing = new Set<string>();
  // A different script for /sw.js, to model a worker-only update.
  let workerSource: string | null = null;
  // Paths served without any HTTP caching, so only the worker can have them.
  let uncached = false;

  test.beforeAll(async () => {
    dirs.one = deploy("one");
    dirs.two = deploy("two");
    server = createServer((req, res) => {
      const path = new URL(req.url!, "http://x").pathname;
      const file = join(
        dirs[current],
        path === "/" ? "index.html" : path.replaceAll("..", ""),
      );
      if (
        missing.has(path) ||
        !statSync(file, { throwIfNoEntry: false })?.isFile()
      ) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        // A host that lets browsers keep pages, to catch a worker that trusts
        // the HTTP cache. Only the worker script is always revalidated.
        "Cache-Control":
          path === "/sw.js"
            ? "no-cache"
            : uncached
              ? "no-store"
              : "max-age=3600",
      });
      res.end(
        path === "/sw.js" && workerSource !== null
          ? workerSource
          : readFileSync(file),
      );
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
  });
  test.afterAll(async () => {
    await new Promise((done) => server.close(done));
    for (const dir of Object.values(dirs))
      rmSync(dir, { recursive: true, force: true });
  });
  test.beforeEach(() => {
    current = "one";
    missing = new Set();
    workerSource = null;
    uncached = false;
  });

  const entry = (page: Page) =>
    page.evaluate(
      () =>
        document.querySelector<HTMLScriptElement>('script[type="module"]')!.src,
    );
  const open = async (page: Page) => {
    await page.goto(origin);
    await ready(page);
    await worker(page);
  };
  // Resolves once the worker for a deploy has saved `file` and nothing older
  // than the previous deploy is left.
  const saved = (page: Page, file: string) =>
    expect
      .poll(
        () =>
          page.evaluate(
            async (url) =>
              (await caches.keys()).filter((n) =>
                n.startsWith("palette-shell-"),
              ).length <= 2 && !!(await caches.match(url)),
            file,
          ),
        { timeout: 20000 },
      )
      .toBe(true);
  const exportPanel = async (page: Page) => {
    await page.getByRole("tab", { name: "Export palette" }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  };

  test("an ordinary visit shows the new deploy, and a panel it changed works offline", async ({
    page,
    context,
  }) => {
    await open(page);
    expect(await entry(page)).toContain("/main-one.js");
    current = "two";
    // A fresh visit, not a reload: the old page is still fresh for an hour.
    await page.goto("about:blank");
    await page.goto(origin);
    await ready(page);
    expect(await entry(page)).toContain("/main-two.js");
    await saved(page, "/assets/ExportPanel-two.js");
    await context.setOffline(true);
    await page.goto(origin);
    await expect(page.locator("#workspace")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 20000 },
    );
    expect(await entry(page)).toContain("/main-two.js");
    await exportPanel(page);
    await expect(page.locator("html")).toHaveAttribute("data-build", "two");
  });

  test("a deploy that is only partly there never replaces the saved version", async ({
    page,
    context,
  }) => {
    await open(page);
    current = "two";
    missing = new Set(["/assets/ExportPanel-two.js"]);
    await page.goto("about:blank");
    await page.goto(origin);
    await ready(page);
    expect(await entry(page)).toContain("/main-two.js");
    // Give the new worker time to try and fail.
    await page.waitForTimeout(3000);
    await context.setOffline(true);
    await page.goto(origin);
    await expect(page.locator("#workspace")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 20000 },
    );
    expect(await entry(page)).toContain("/main-one.js");
    await exportPanel(page);
    await expect(page.locator("html")).toHaveAttribute("data-build", "one");
  });

  test("a tab left on the old deploy still opens a panel it never loaded, offline", async ({
    page,
    context,
  }) => {
    // The browser's own cache must not be able to supply the old panel.
    uncached = true;
    await open(page);
    expect(await entry(page)).toContain("/main-one.js");
    await page.evaluate(() => {
      const w = window as unknown as { takenOver: boolean };
      w.takenOver = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        w.takenOver = true;
      });
    });
    // A revision from before the previous deploy, which nothing needs now.
    await page.evaluate(async () => {
      const cache = await caches.open("palette-shell-ancient");
      await cache.put("/installed-at", new Response("1"));
    });
    current = "two";
    // The new deploy arrives through a second tab; the first stays as it was.
    const other = await context.newPage();
    await other.goto(origin);
    await ready(other);
    await saved(other, "/assets/ExportPanel-two.js");
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { takenOver: boolean }).takenOver,
        ),
      )
      .toBe(true);
    const kept = await page.evaluate(async () =>
      (await caches.keys()).filter((n) => n.startsWith("palette-shell-")),
    );
    expect(kept).toHaveLength(2);
    expect(kept).not.toContain("palette-shell-ancient");
    await context.setOffline(true);
    await exportPanel(page);
    await expect(page.locator("html")).toHaveAttribute("data-build", "one");
  });

  test("a worker-only update that fails to install leaves the saved version working", async ({
    page,
    context,
  }) => {
    await open(page);
    const first = await page.evaluate(async () =>
      (await caches.keys()).filter((n) => n.startsWith("palette-shell-")),
    );
    // Same files, so the same cache name; only the worker's own bytes differ.
    workerSource =
      readFileSync(join(dirs.one, "sw.js"), "utf8") + "\n// update\n";
    missing = new Set(["/assets/ExportPanel-one.js"]);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    // Give the new worker time to try and fail.
    await page.waitForTimeout(3000);
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).filter((n) => n.startsWith("palette-shell-")),
      ),
    ).toEqual(first);
    await context.setOffline(true);
    await page.goto(origin);
    await expect(page.locator("#workspace")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 20000 },
    );
    await exportPanel(page);
    await expect(page.locator("html")).toHaveAttribute("data-build", "one");
  });

  test("the explainer opens offline without an earlier visit", async ({
    page,
    context,
  }) => {
    await open(page);
    await context.setOffline(true);
    await page.goto(`${origin}/how.html`);
    await expect(page).toHaveTitle(/How median cut works/);
    await expect(
      page.getByRole("heading", { name: "How median cut works" }),
    ).toBeVisible();
  });

  test("a path that was never saved gets a plain offline page, not the app", async ({
    page,
    context,
  }) => {
    await open(page);
    await context.setOffline(true);
    await page.goto(`${origin}/never-saved`);
    await expect(page).toHaveTitle("Offline");
    await expect(
      page.getByRole("heading", { name: "You are offline" }),
    ).toBeVisible();
    await expect(page.locator("#workspace")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /palette tool/ }),
    ).toBeVisible();
  });

  // The page's own requests are intercepted here, so the worker stays out of
  // the way.
  test.describe("a code chunk that fails to load", () => {
    test.use({ serviceWorkers: "block" });

    const exportTab = (page: Page) =>
      page.getByRole("tab", { name: "Export palette" });
    const notice = (page: Page) => page.locator(".panel-boundary");
    const reloadButton = (page: Page) =>
      page.getByRole("button", { name: "Reload page" });
    // A shared script keeps its name across the two copies of the site, which
    // a real deploy would rename, so the browser must not keep it.
    test.beforeEach(() => {
      uncached = true;
    });
    const visit = async (
      page: Page,
      size?: { width: number; height: number },
    ) => {
      if (size) await page.setViewportSize(size);
      await page.goto(origin);
      await ready(page);
    };
    const loadsOf = (page: Page) => {
      const count = { loads: 0 };
      page.on("load", () => count.loads++);
      return count;
    };
    const failOnce = async (page: Page, pattern: string | RegExp) => {
      let blocked = false;
      await page.route(pattern, (route) => {
        if (blocked) return route.continue();
        blocked = true;
        return route.abort();
      });
    };
    const fail = (page: Page, pattern: string | RegExp) =>
      page.route(pattern, (route) => route.abort());
    // The chunk a panel imports besides the app's own shared code, named from
    // the build's chunk graph rather than guessed.
    const dependencyOf = (source: string) => {
      const manifest = JSON.parse(
        readFileSync(join("dist", ".vite", "manifest.json"), "utf8"),
      ) as Record<string, { file: string; imports?: string[] }>;
      const own = (manifest[source].imports ?? []).filter(
        (key) => key !== "index.html" && !key.startsWith("_index"),
      );
      expect(own.length).toBeGreaterThan(0);
      return manifest[own[0]].file;
    };
    const nudgeSwatch = async (page: Page, index: number) => {
      const before = (await hexes(page))[index];
      await page.locator(".swatch-select").nth(index).focus();
      await page.keyboard.press("Shift+ArrowUp");
      await expect
        .poll(async () => (await hexes(page))[index])
        .not.toBe(before);
    };
    const checkAxe = async (page: Page) => {
      const violations = (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations;
      expect(violations).toEqual([]);
    };

    const panels = [
      {
        name: "its own chunk",
        tab: "Export palette",
        chunk: () => /\/assets\/ExportPanel-[\w-]+\.js$/,
        shown: (page: Page) =>
          expect(page.locator("html")).toHaveAttribute("data-build", "one"),
      },
      {
        name: "a chunk it imports",
        tab: "Export palette",
        chunk: () => `**/${dependencyOf("src/components/ExportPanel.tsx")}`,
        shown: (page: Page) =>
          expect(page.locator("html")).toHaveAttribute("data-build", "one"),
      },
      {
        name: "a chunk the contrast panel imports",
        tab: "Contrast check",
        chunk: () => `**/${dependencyOf("src/components/ContrastPanel.tsx")}`,
        shown: (page: Page) =>
          expect(page.locator(".cvd-control")).toBeVisible(),
      },
    ];
    for (const panel of panels)
      test(`a panel that fails on ${panel.name} leaves the app up, and Reload page brings it back with the palette`, async ({
        page,
      }) => {
        await failOnce(page, panel.chunk());
        await visit(page);
        await nudgeSwatch(page, 2);
        const shown = await hexes(page);
        await page.evaluate(() => {
          (window as unknown as { sameDocument: boolean }).sameDocument = true;
        });
        const count = loadsOf(page);
        await page.getByRole("tab", { name: panel.tab }).click();
        await expect(notice(page)).toHaveAttribute("role", "alert");
        await expect(notice(page)).toContainText(
          "This part of the app could not load.",
        );
        await expect(notice(page)).toBeFocused();
        await expect(
          page.getByRole("button", { name: "Try again" }),
        ).toHaveCount(0);
        // The page is not replaced: its state, and the rest of the app, stay.
        await page.waitForTimeout(1000);
        expect(count.loads).toBe(0);
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { sameDocument?: boolean }).sameDocument,
          ),
        ).toBe(true);
        expect(await hexes(page)).toEqual(shown);
        await checkAxe(page);

        const reloaded = page.waitForEvent("load");
        await reloadButton(page).click();
        await reloaded;
        // The palette, edits included, travels in the address.
        expect(page.url()).toContain("#p=");
        await ready(page);
        expect(await hexes(page)).toEqual(shown);
        await expect(page.locator(".image-caption > span").first()).toHaveText(
          "Shared palette",
        );
        await page.getByRole("tab", { name: panel.tab }).click();
        await panel.shown(page);
        await expect(notice(page)).toHaveCount(0);
      });

    test("a tab on an older deploy offers a newer version and reloads into it only when asked", async ({
      page,
    }) => {
      await visit(page);
      expect(await entry(page)).toContain("/main-one.js");
      const shown = await hexes(page);
      current = "two";
      missing = new Set(["/assets/ExportPanel-one.js"]);
      const count = loadsOf(page);
      await exportTab(page).click();
      await expect(notice(page)).toContainText(
        "A newer version of the app is available.",
      );
      await expect(notice(page)).toBeFocused();
      await page.waitForTimeout(1000);
      expect(count.loads).toBe(0);
      const reloaded = page.waitForEvent("load");
      await reloadButton(page).click();
      await reloaded;
      await ready(page);
      expect(await entry(page)).toContain("/main-two.js");
      expect(await hexes(page)).toEqual(shown);
      await exportTab(page).click();
      await expect(page.locator("html")).toHaveAttribute("data-build", "two");
    });

    test("a panel missing from every deploy keeps offering a reload and never starts one", async ({
      page,
    }) => {
      await visit(page);
      current = "two";
      missing = new Set([
        "/assets/ExportPanel-one.js",
        "/assets/ExportPanel-two.js",
      ]);
      const count = loadsOf(page);
      await exportTab(page).click();
      await expect(notice(page)).toContainText(
        "A newer version of the app is available.",
      );
      const reloaded = page.waitForEvent("load");
      await reloadButton(page).click();
      await reloaded;
      await ready(page);
      await exportTab(page).click();
      await expect(notice(page)).toContainText(
        "This part of the app could not load.",
      );
      await page.waitForTimeout(1500);
      expect(count.loads).toBe(1);
    });

    test("a bug in a panel shows the general message without checking for a new build", async ({
      page,
    }) => {
      await page.route(/\/assets\/ExportPanel-[\w-]+\.js$/, (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: 'export const ExportPanel = () => { throw new Error("broken panel"); };',
        }),
      );
      const logged: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") logged.push(message.text());
      });
      await visit(page);
      const checked: string[] = [];
      page.on("request", (request) => {
        if (request.url() === `${origin}/`) checked.push(request.url());
      });
      await exportTab(page).click();
      await expect(notice(page)).toHaveText(
        /Something went wrong in this part of the app\./,
      );
      await expect(notice(page)).toBeFocused();
      await expect(reloadButton(page)).toBeVisible();
      expect(logged.join("\n")).toContain("broken panel");
      await page.waitForTimeout(1000);
      expect(checked).toEqual([]);
      await expect(page.locator(".swatch")).toHaveCount(6);
    });

    test("closing a camera that cannot load turns the camera button back on", async ({
      page,
    }) => {
      await fail(page, /\/assets\/CameraCapture-[\w-]+\.js$/);
      await visit(page);
      const camera = page.getByRole("button", { name: "Use camera" });
      await camera.click();
      await expect(notice(page)).toBeVisible();
      await expect(notice(page)).toBeFocused();
      await expect(camera).toBeDisabled();
      await page.getByRole("button", { name: "Dismiss" }).click();
      await expect(notice(page)).toHaveCount(0);
      await expect(camera).toBeEnabled();
      await expect(page.locator(".swatch")).toHaveCount(6);
    });

    test("dismissing the notice for a color-vision simulation turns the simulation off", async ({
      page,
    }) => {
      await fail(page, /\/assets\/CvdFilterDefs-[\w-]+\.js$/);
      await visit(page);
      await page.getByRole("tab", { name: "Contrast check" }).click();
      const protanopia = page.getByRole("radio", { name: /protanopia/i });
      await protanopia.check();
      await expect(notice(page)).toBeVisible();
      await page.getByRole("button", { name: "Dismiss" }).click();
      await expect(notice(page)).toHaveCount(0);
      await expect(protanopia).not.toBeChecked();
      await expect(page.getByRole("radio", { name: /none/i })).toBeChecked();
    });

    test("the tool sheet's notice sits in the sheet's place and the tab bar keeps working", async ({
      page,
    }) => {
      await fail(page, /\/assets\/BottomSheet-[\w-]+\.js$/);
      await visit(page, { width: 390, height: 844 });
      const inPlace = page.locator(".workbench .panel-boundary");
      await expect(inPlace).toContainText(
        "This part of the app could not load.",
      );
      await expect(
        inPlace.getByRole("button", { name: "Dismiss" }),
      ).toHaveCount(0);
      const contrast = page.getByRole("tab", { name: "Contrast check" });
      await contrast.click();
      await expect(contrast).toHaveAttribute("aria-selected", "true");
      await expect(inPlace).toBeVisible();
      // The failure comes back after each choice, but never takes focus off
      // the bar, so its arrow keys still move between tabs.
      await expect(contrast).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "How it works" }),
      ).toBeFocused();
      await page.getByRole("tab", { name: "Export palette" }).click();
      await expect(
        page.getByRole("tab", { name: "Export palette" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(inPlace).toBeVisible();
    });

    for (const size of [
      { width: 390, height: 844 },
      { width: 1440, height: 1000 },
    ])
      test(`stacked notices pass axe and do not overlap at ${size.width}px`, async ({
        page,
      }) => {
        await fail(
          page,
          /\/assets\/(ExportPanel|CameraCapture|ShortcutSheet)-[\w-]+\.js$/,
        );
        await visit(page, size);
        await page.getByRole("button", { name: "Use camera" }).click();
        await expect(notice(page)).toHaveCount(1);
        await page.keyboard.press("?");
        const floating = page.locator(".panel-notices > .panel-boundary");
        await expect(floating).toHaveCount(2);
        const [first, second] = await floating.evaluateAll((cards) =>
          cards.map((card) => card.getBoundingClientRect().toJSON()),
        );
        expect(first.bottom).toBeLessThanOrEqual(second.top);
        await page.getByRole("tab", { name: "Export palette" }).click();
        await expect(notice(page)).toHaveCount(3);
        await expect(
          page
            .locator(".panel-boundary:not(.floating)")
            .getByText("This part of the app could not load."),
        ).toBeVisible();
        await checkAxe(page);
        await page.getByRole("button", { name: "Dismiss" }).first().click();
        await expect(floating).toHaveCount(1);
        await expect(page.locator(".swatch")).toHaveCount(6);
      });
  });
});

test.describe("when the worker is turned off with a new deploy", () => {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
  };
  const dirs: Record<string, string> = {};
  let server: Server;
  let origin = "";
  let current = "on";

  test.beforeAll(async () => {
    dirs.on = resolve("dist");
    // A real build with the switch set, as the host would make it.
    dirs.off = mkdtempSync(join(tmpdir(), "deploy-off-"));
    execFileSync(
      process.execPath,
      [
        resolve("node_modules/vite/bin/vite.js"),
        "build",
        "--outDir",
        dirs.off,
        "--emptyOutDir",
      ],
      { env: { ...process.env, SW_OFF: "1" }, stdio: "pipe" },
    );
    server = createServer((req, res) => {
      const path = new URL(req.url!, "http://x").pathname;
      const file = join(
        dirs[current],
        path === "/" ? "index.html" : path.replaceAll("..", ""),
      );
      if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": path === "/sw.js" ? "no-cache" : "max-age=3600",
      });
      res.end(readFileSync(file));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
  });
  test.afterAll(async () => {
    await new Promise((done) => server.close(done));
    rmSync(dirs.off, { recursive: true, force: true });
  });

  test("an earlier visitor ends up with no worker and no saved copy", async ({
    page,
  }) => {
    test.setTimeout(60000);
    current = "on";
    await page.goto(origin);
    await ready(page);
    await worker(page);
    await page.reload();
    await ready(page);
    const before = await page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      controlled: !!navigator.serviceWorker.controller,
      caches: (await caches.keys()).filter((name) =>
        /^palette-(shell-|shared-image$)/.test(name),
      ).length,
    }));
    expect(before.registrations).toBe(1);
    expect(before.controlled).toBe(true);
    expect(before.caches).toBeGreaterThan(0);

    current = "off";
    // A fresh visit, as any later one is.
    await page.goto("about:blank");
    await page.goto(origin);
    // The page and the retiring worker may each reload it once.
    await expect
      .poll(
        () =>
          page
            .evaluate(async () => ({
              registrations: (await navigator.serviceWorker.getRegistrations())
                .length,
              caches: (await caches.keys()).filter((name) =>
                /^palette-(shell-|shared-image$)/.test(name),
              ),
            }))
            .catch(() => null),
        { timeout: 15000 },
      )
      .toEqual({ registrations: 0, caches: [] });
    // Past the delay the normal build registers after, and any reload.
    await page.waitForTimeout(5000);
    await page.goto(origin);
    await ready(page);
    expect(
      await page.evaluate(async () => ({
        registrations: (await navigator.serviceWorker.getRegistrations())
          .length,
        controlled: !!navigator.serviceWorker.controller,
      })),
    ).toEqual({ registrations: 0, controlled: false });
    await expect(page.locator(".swatch")).toHaveCount(6);
  });
});
