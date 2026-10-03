import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, svg } from "./helpers";

// The fake camera plays tests/fixtures/camera.y4m in a loop: red, yellow,
// purple and near-black bars for 1.6 s, then blue, teal, green and white.
const FIRST_HALF = { r: 0xd9, g: 0x42, b: 0x3a };
const SECOND_HALF = { r: 0x2f, g: 0x6f, b: 0xdb };

const paletteHexes = (page: Page) =>
  page
    .locator(".swatch-info button code")
    .allInnerTexts()
    .then((texts) => texts.filter((text) => /^#[0-9a-f]{6}$/i.test(text)));

function hasNear(hexes: string[], target: typeof FIRST_HALF) {
  return hexes.some((hex) => {
    const n = parseInt(hex.slice(1), 16);
    const d = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return Math.hypot(d[0] - target.r, d[1] - target.g, d[2] - target.b) < 60;
  });
}

/** Remembers every stream the page opens, so a test can check each one ended. */
async function trackStreams(page: Page) {
  await page.addInitScript(() => {
    const win = window as unknown as { __streams: MediaStream[] };
    win.__streams = [];
    const open = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await open(constraints);
      win.__streams.push(stream);
      return stream;
    };
  });
}

const streamsEnded = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __streams: MediaStream[] }).__streams.every(
      (stream) => stream.getTracks().every((t) => t.readyState === "ended"),
    ),
  );

async function startCamera(page: Page) {
  await page.getByRole("button", { name: "Use camera" }).click();
  await expect(page.locator(".camera-layer")).toHaveAttribute(
    "data-camera-status",
    "live",
  );
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.html),
    })),
  ).toEqual([]);
}

test("the camera shows video and the palette follows the clip's colors", async ({
  page,
}) => {
  await trackStreams(page);
  await page.goto("/");
  await ready(page);
  const sample = await paletteHexes(page);
  await startCamera(page);
  await expect(page.locator(".camera-video")).toBeVisible();
  await expect
    .poll(
      async () => {
        const video = page.locator(".camera-video");
        return video.evaluate((el: HTMLVideoElement) => el.videoWidth);
      },
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Live camera",
  );
  // The clip loops, so both halves show up within a few seconds.
  await expect
    .poll(async () => hasNear(await paletteHexes(page), FIRST_HALF), {
      timeout: 15000,
    })
    .toBe(true);
  await expect
    .poll(async () => hasNear(await paletteHexes(page), SECOND_HALF), {
      timeout: 15000,
    })
    .toBe(true);
  expect(await paletteHexes(page)).not.toEqual(sample);
  // The camera's palette never leaves the stage showing the old photo.
  await expect(page.locator(".stage-points")).toHaveCount(0);
});

test("Freeze keeps the frozen palette and returns to the normal flow", async ({
  page,
}) => {
  await trackStreams(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await expect
    .poll(async () => hasNear(await paletteHexes(page), FIRST_HALF), {
      timeout: 15000,
    })
    .toBe(true);
  await page.getByRole("button", { name: "Freeze" }).click();
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Camera photo",
  );
  await ready(page);
  expect(await streamsEnded(page)).toBe(true);
  // The clip has moved on by now; the frozen palette must not follow it.
  const frozen = await paletteHexes(page);
  await page.waitForTimeout(4000);
  expect(await paletteHexes(page)).toEqual(frozen);
  // The normal post-upload tools work on the frozen photo.
  await page.getByRole("button", { name: "More colors" }).click();
  await ready(page);
  await expect(page.locator(".swatch")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Use camera" })).toBeEnabled();
});

test("a tap on the video freezes it", async ({ page }) => {
  await trackStreams(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await page.locator(".camera-video").click();
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Camera photo",
  );
  expect(await streamsEnded(page)).toBe(true);
});

test("closing the camera restores the photo and stops the stream", async ({
  page,
}) => {
  await trackStreams(page);
  await page.goto("/");
  await ready(page);
  const sample = await paletteHexes(page);
  await startCamera(page);
  await page.getByRole("button", { name: "Close camera" }).click();
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  expect(await streamsEnded(page)).toBe(true);
  await ready(page);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Golden dunes",
  );
  await expect.poll(() => paletteHexes(page)).toEqual(sample);
});

test("hiding the tab stops the camera", async ({ page }) => {
  await trackStreams(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  expect(await streamsEnded(page)).toBe(true);
});

test("another photo replaces the camera", async ({ page }) => {
  await trackStreams(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await page.getByLabel("Upload an image").setInputFiles({
    name: "teal.svg",
    mimeType: "image/svg+xml",
    buffer: svg("#1b7f79"),
  });
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  expect(await streamsEnded(page)).toBe(true);
  await ready(page);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "teal.svg",
  );
});

test.describe("when the camera is blocked", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(
          new DOMException("Permission denied", "NotAllowedError"),
        );
    });
  });

  test("a plain message and the upload fallback appear", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Use camera" }).click();
    const message = page
      .getByRole("alert")
      .filter({ hasText: "Camera access" });
    await expect(message).toContainText("Camera access was blocked.");
    await expect(message).toContainText("upload a photo instead");
    const chooser = page.waitForEvent("filechooser");
    await page
      .locator(".camera-error")
      .getByRole("button", { name: "Upload image" })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "plum.svg",
      mimeType: "image/svg+xml",
      buffer: svg("#6a3d7c"),
    });
    await expect(page.locator(".camera-layer")).toHaveCount(0);
    await ready(page);
    await expect(page.locator(".image-caption > span").first()).toHaveText(
      "plum.svg",
    );
  });

  test("Close returns to the photo", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Use camera" }).click();
    await page
      .locator(".camera-error")
      .getByRole("button", { name: "Close" })
      .click();
    await expect(page.locator(".camera-layer")).toHaveCount(0);
    await expect(page.locator(".image-caption > span").first()).toHaveText(
      "Golden dunes",
    );
  });
});

for (const width of [390, 768, 1440]) {
  test(`the camera and its error message pass axe at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await ready(page);
    await startCamera(page);
    await axeClean(page);
    await page.getByRole("button", { name: "Close camera" }).click();
    await expect(page.locator(".camera-layer")).toHaveCount(0);
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("No camera", "NotFoundError"));
    });
    await page.getByRole("button", { name: "Use camera" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "camera" }),
    ).toContainText("No camera was found");
    await axeClean(page);
  });
}

/** Makes encoding a frozen frame slow, the way it is on a busy phone. */
async function slowEncoding(page: Page) {
  await page.addInitScript(() => {
    const win = window as unknown as { __encodes: number };
    win.__encodes = 0;
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      win.__encodes++;
      original.call(
        this,
        (blob) => setTimeout(callback, 1500, blob),
        type,
        quality,
      );
    };
  });
}

test("a freeze still encoding does not replace a sample chosen right after it", async ({
  page,
}) => {
  await slowEncoding(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await page.getByRole("button", { name: "Freeze" }).click();
  await page.getByRole("button", { name: "Try Forest floor" }).click();
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  await ready(page);
  await page.waitForTimeout(2500);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Forest floor",
  );
});

test("a freeze still encoding does not survive closing the camera", async ({
  page,
}) => {
  await slowEncoding(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await page.getByRole("button", { name: "Freeze" }).click();
  await page.getByRole("button", { name: "Close camera" }).click();
  await expect(page.locator(".camera-layer")).toHaveCount(0);
  await page.waitForTimeout(2500);
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Golden dunes",
  );
});

test("repeated Freeze presses encode one photo", async ({ page }) => {
  await slowEncoding(page);
  await page.goto("/");
  await ready(page);
  await startCamera(page);
  await page.locator(".camera-freeze").dblclick();
  await expect(page.locator(".image-caption > span").first()).toHaveText(
    "Camera photo",
    { timeout: 10000 },
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __encodes: number }).__encodes,
    ),
  ).toBe(1);
});
