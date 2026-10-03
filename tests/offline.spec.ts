import { createServer, type Server } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { imageSize, ready } from "./helpers";

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
