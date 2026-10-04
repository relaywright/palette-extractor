import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { ready, settled } from "./helpers";

// Runs with WebGL and with it switched off: the recolor layer paints the
// photo on the GPU in one and on a 2D canvas of the 320 px copy in the other.
const expectedMode = (testInfo: TestInfo) =>
  testInfo.project.name === "modes-no-webgl" ? "cpu" : "webgl";

const layer = (page: Page) => page.locator("canvas.recolor-layer");
const draws = async (page: Page) =>
  Number((await layer(page).getAttribute("data-recolor-draws")) ?? 0);

// How far the layer's pixels are from the photo itself drawn at the layer's
// size with the same cover crop, as the mean absolute channel difference.
async function distanceFromPhoto(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "canvas.recolor-layer",
    )!;
    const photo = document.querySelector<HTMLImageElement>(
      ".source-frame > img",
    )!;
    const { width, height } = canvas;
    const read = (draw: (c: CanvasRenderingContext2D) => void) => {
      const copy = document.createElement("canvas");
      copy.width = width;
      copy.height = height;
      const context = copy.getContext("2d", { willReadFrequently: true })!;
      draw(context);
      return context.getImageData(0, 0, width, height).data;
    };
    const layerPixels = read((c) => c.drawImage(canvas, 0, 0));
    const scale = Math.max(
      width / photo.naturalWidth,
      height / photo.naturalHeight,
    );
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    const photoPixels = read((c) =>
      c.drawImage(photo, (width - w) / 2, (height - h) / 2, w, h),
    );
    let total = 0;
    for (let i = 0; i < layerPixels.length; i += 4)
      for (let k = 0; k < 3; k++)
        total += Math.abs(layerPixels[i + k] - photoPixels[i + k]);
    return total / ((layerPixels.length / 4) * 3);
  });
}

test("editing recolors the photo layer and Reset restores it", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await ready(page);
  await settled(page);
  await expect(layer(page)).toHaveCount(0);

  await page.locator(".swatch-select").nth(1).focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+PageUp");
  await expect(layer(page)).toHaveAttribute(
    "data-recolor-mode",
    expectedMode(testInfo),
  );
  await expect(layer(page)).toHaveAttribute("data-active", "true");
  await expect.poll(() => draws(page)).toBeGreaterThan(0);
  const seen = await draws(page);
  // Let the last nudge's repaint land before reading pixels.
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(() => draws(page)).toBeGreaterThan(seen);
  const edited = await distanceFromPhoto(page);
  expect(edited).toBeGreaterThan(1.5);

  await page.getByRole("button", { name: "Reset to extracted" }).click();
  await expect(layer(page)).toHaveAttribute("data-active", "false");
  await expect
    .poll(() => distanceFromPhoto(page))
    .toBeLessThan(expectedMode(testInfo) === "cpu" ? 0.5 : 4);
  expect(edited).toBeGreaterThan(await distanceFromPhoto(page));
});

test("a second edit after Reset recolors again", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await settled(page);
  await page.locator(".swatch-select").nth(2).focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+ArrowDown");
  await expect(layer(page)).toHaveAttribute("data-active", "true");
  await page.getByRole("button", { name: "Reset to extracted" }).click();
  await expect(layer(page)).toHaveAttribute("data-active", "false");
  await page.locator(".swatch-select").nth(2).focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(layer(page)).toHaveAttribute("data-active", "true");
  await expect.poll(() => distanceFromPhoto(page)).toBeGreaterThan(1.5);
});
