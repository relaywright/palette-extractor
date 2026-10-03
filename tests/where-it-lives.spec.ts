import { test, expect } from "@playwright/test";
import { ready, stageDone } from "./helpers";
import { noAxeViolations, photoView, WIDTHS } from "./touch-checks";

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
