import { test, expect } from "@playwright/test";
import { ready, stageDone } from "./helpers";
import {
  hexes,
  noAxeViolations,
  photoView,
  QUARTERS,
  upload,
  WIDTHS,
} from "./touch-checks";

const dim = (page: import("@playwright/test").Page) =>
  page.locator(".photo-dim");

/** Share of the dim canvas that is clear (lit) and dark, from its alpha. */
const coverage = (page: import("@playwright/test").Page) =>
  dim(page).evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0,
      dark = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 20) clear++;
      else if (data[i] > 150) dark++;
    }
    return { clear, dark, total: data.length / 4 };
  });

async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await ready(page);
  await stageDone(page);
  await photoView(page);
}

test("a hovered swatch dims the photo except its sampled pixels", async ({
  page,
}) => {
  await open(page);
  await expect(dim(page)).toHaveAttribute("data-dim", "off");
  const swatch = page.locator(".swatch").nth(2);
  await swatch.hover();
  await expect(dim(page)).toHaveAttribute("data-dim", "on");
  await expect(dim(page)).toHaveCSS("opacity", "1");
  const name = await swatch.locator(".swatch-info span").first().innerText();
  await expect(page.locator(".focus-note")).toHaveText(
    `Sampled pixels near ${name}`,
  );
  const { clear, dark, total } = await coverage(page);
  expect(clear).toBeGreaterThan(total * 0.05);
  expect(dark).toBeGreaterThan(total * 0.3);
  // The caption claims samples, never an object outline.
  await expect(page.locator(".focus-note")).not.toContainText(
    /object|segment/i,
  );

  await page.mouse.move(2, 2);
  await expect(dim(page)).toHaveAttribute("data-dim", "off");
  await expect(dim(page)).toHaveCSS("opacity", "0");
});

test("the lit pixels match the swatch's share of the samples", async ({
  page,
}) => {
  await open(page);
  const count = await page.locator(".swatch").count();
  for (let i = 0; i < count; i++) {
    const swatch = page.locator(".swatch").nth(i);
    await swatch.hover();
    await expect(dim(page)).toHaveAttribute("data-dim", "on");
    const mask = await dim(page).evaluate((canvas: HTMLCanvasElement) => ({
      pixels: Number(canvas.dataset.litPixels),
      samples: Number(canvas.dataset.litSamples),
      total: Number(canvas.dataset.totalSamples),
    }));
    // The mask has one pixel per lit sample.
    expect(Math.abs(mask.pixels - mask.samples)).toBeLessThanOrEqual(
      mask.samples * 0.02,
    );
    // And that share agrees with the weight the swatch shows for the whole
    // image, within a point.
    const weight = Number.parseFloat(
      (await swatch.locator(".swatch-select span").nth(1).innerText()).replace(
        "%",
        "",
      ),
    );
    expect(Math.abs((mask.samples / mask.total) * 100 - weight)).toBeLessThan(
      1.5,
    );
  }
});

test("the caption names a swatch as the palette shows it after an edit", async ({
  page,
}) => {
  await open(page);
  const name = (index: number) =>
    page.locator(".swatch").nth(index).locator(".swatch-info span").first();
  const original = await name(2).innerText();
  await page.locator(".swatch-select").nth(2).focus();
  for (let i = 0; i < 12 && (await name(2).innerText()) === original; i++) {
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(60);
  }
  const edited = await name(2).innerText();
  expect(edited).not.toBe(original);
  await page.locator(".swatch").nth(2).hover();
  await expect(page.locator(".focus-note")).toHaveText(
    `Sampled pixels near ${edited}`,
  );
});

// Four flat quarters, so which pixels belong to each swatch is known without
// asking the app: a pixel belongs to the swatch whose color it is.
const QUARTER_OF: Record<string, [number, number]> = {
  "#c8321e": [0, 0],
  "#1e64c8": [1, 0],
  "#2a9d5c": [0, 1],
  "#f4c300": [1, 1],
};

test("the drawn dim lights the swatch's quarter and nothing else", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await stageDone(page);
  await upload(page, "quarters.svg", QUARTERS);
  await photoView(page);
  const colors = await hexes(page);
  expect(colors.sort()).toEqual(Object.keys(QUARTER_OF).sort());

  for (const [i, hex] of (await hexes(page)).entries()) {
    await page.locator(".swatch").nth(i).hover();
    await expect(dim(page)).toHaveAttribute("data-dim", "on");
    const drawn = await dim(page).evaluate(
      (canvas: HTMLCanvasElement, quarter: [number, number]) => {
        // The photo is 600 by 330, held at 320 by 176 for the quantizer.
        const photo = { width: 600, height: 330 };
        const work = { width: 320, height: 176 };
        const { width: w, height: h } = canvas;
        const { data } = canvas.getContext("2d")!.getImageData(0, 0, w, h);
        const scale = Math.max(w / photo.width, h / photo.height);
        const offsetX = (w - photo.width * scale) / 2;
        const offsetY = (h - photo.height * scale) / 2;
        // Samples sit one in every few pixels, and a pixel's lit share counts
        // the samples within this many working pixels of it. Pixels farther
        // than that (plus a pixel of resampling) from a quarter's edge must
        // be fully lit or fully dimmed; closer ones may fall anywhere between.
        const samples = Number(canvas.dataset.totalSamples);
        const radius = Math.max(
          1,
          Math.round(Math.sqrt((work.width * work.height) / samples) * 1.5),
        );
        const band = radius + 1.5;
        const scrim = Math.round(255 * 0.72);
        let wrong = 0,
          litInside = 0,
          dimmedOutside = 0,
          weight = 0,
          sumX = 0,
          sumY = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const alpha = data[4 * (y * w + x) + 3];
            const lit = 1 - alpha / scrim;
            weight += lit;
            sumX += lit * x;
            sumY += lit * y;
            const u = (x + 0.5 - offsetX) / scale / photo.width;
            const v = (y + 0.5 - offsetY) / scale / photo.height;
            const edge = Math.min(
              Math.abs(u - 0.5) * work.width,
              Math.abs(v - 0.5) * work.height,
            );
            if (edge <= band) continue;
            const inside =
              u < 0.5 === (quarter[0] === 0) && v < 0.5 === (quarter[1] === 0);
            if (inside) {
              litInside++;
              if (alpha > 4) wrong++;
            } else {
              dimmedOutside++;
              if (alpha < scrim - 4) wrong++;
            }
          }
        // Where the quarter's visible part is, in canvas pixels.
        const span = (
          index: number,
          size: number,
          offset: number,
          total: number,
        ) => {
          const from = Math.max(0, offset + index * (size / 2) * scale);
          const to = Math.min(total, offset + (index + 1) * (size / 2) * scale);
          return [from, to];
        };
        const [x0, x1] = span(quarter[0], photo.width, offsetX, w);
        const [y0, y1] = span(quarter[1], photo.height, offsetY, h);
        return {
          wrong,
          litInside,
          dimmedOutside,
          lit: weight / (w * h),
          expected: ((x1 - x0) * (y1 - y0)) / (w * h),
          centroidX: sumX / weight / w,
          centroidY: sumY / weight / h,
          expectedX: (x0 + x1) / 2 / w,
          expectedY: (y0 + y1) / 2 / h,
        };
      },
      QUARTER_OF[hex],
    );
    // Both sides of the edge were actually checked.
    expect(drawn.litInside).toBeGreaterThan(1000);
    expect(drawn.dimmedOutside).toBeGreaterThan(1000);
    expect(drawn.wrong, `${hex}: pixels away from the edge`).toBe(0);
    // The lit area is the quarter's area, within 2%, and sits where it does.
    expect(Math.abs(drawn.lit - drawn.expected)).toBeLessThanOrEqual(
      drawn.expected * 0.02,
    );
    expect(Math.abs(drawn.centroidX - drawn.expectedX)).toBeLessThan(0.015);
    expect(Math.abs(drawn.centroidY - drawn.expectedY)).toBeLessThan(0.015);
  }
});

test("keyboard focus on a swatch dims the photo and leaving restores it", async ({
  page,
}) => {
  await open(page);
  // Focus counts once the keyboard is what the page is being used with.
  await page.keyboard.press("Tab");
  await page.locator(".swatch").nth(1).locator(".swatch-select").focus();
  await expect(dim(page)).toHaveAttribute("data-dim", "on");
  await page.locator(".swatch").nth(0).locator(".swatch-select").focus();
  await expect(dim(page)).toHaveAttribute("data-dim", "on");
  await page.locator("body").evaluate(() => {
    (document.activeElement as HTMLElement).blur();
  });
  await expect(dim(page)).toHaveAttribute("data-dim", "off");
});

test("reduced motion shows the dim without a fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(dim(page)).toHaveCSS("transition-duration", "0s");
  await page.locator(".swatch").nth(2).hover();
  await expect(dim(page)).toHaveAttribute("data-dim", "on");
  await expect(dim(page)).toHaveCSS("opacity", "1");
});

test("no photo dim is mounted in the color space view", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await stageDone(page);
  await page.locator(".swatch").nth(2).hover();
  await expect(page.locator(".photo-dim")).toHaveCount(0);
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("tapping a swatch dims the photo until the next tap elsewhere", async ({
    page,
  }) => {
    await open(page);
    await page.locator(".swatch").nth(1).locator(".swatch-color").tap();
    await expect(dim(page)).toHaveAttribute("data-dim", "on");
    await page.waitForTimeout(300);
    await expect(dim(page)).toHaveAttribute("data-dim", "on");
    await page.locator("h1").tap();
    await expect(dim(page)).toHaveAttribute("data-dim", "off");
  });

  test("a tapped swatch gives way when the keyboard moves to another", async ({
    page,
  }) => {
    await open(page);
    const name = (index: number) =>
      page.locator(".swatch").nth(index).locator(".swatch-info span").first();
    await page.locator(".swatch").nth(1).locator(".swatch-color").tap();
    await expect(page.locator(".focus-note")).toHaveText(
      `Sampled pixels near ${await name(1).innerText()}`,
    );
    await page.keyboard.press("Tab");
    await page.locator(".swatch").nth(3).locator(".swatch-select").focus();
    await expect(page.locator(".focus-note")).toHaveText(
      `Sampled pixels near ${await name(3).innerText()}`,
    );
  });
});

for (const size of WIDTHS)
  test(`a dimmed photo has no accessibility violations at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await open(page);
    const swatch = page.locator(".swatch").nth(2);
    await swatch.scrollIntoViewIfNeeded();
    await swatch.hover();
    await expect(dim(page)).toHaveAttribute("data-dim", "on");
    await expect(page.locator(".focus-note")).toBeVisible();
    await noAxeViolations(page);
  });
