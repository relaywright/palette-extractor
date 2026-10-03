import { test, expect, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { ready } from "./helpers";

// A logo-like PNG: four flat colors, every pixel half transparent. Whatever
// shows the photo has to show it once, or the alpha stacks up.
const ALPHA = 128;
const QUADRANTS = [
  [210, 60, 50],
  [50, 90, 200],
  [60, 170, 80],
  [230, 200, 60],
];

function crc32(bytes: Buffer) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
function translucentPng(size = 64) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b] =
        QUADRANTS[(y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1)];
      rows.set([r, g, b, ALPHA], y * (size * 4 + 1) + 1 + x * 4);
    }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const layer = (page: Page) => page.locator("canvas.recolor-layer");
const photoVisibility = (page: Page) =>
  page
    .locator(".source-frame > img")
    .evaluate((img) => getComputedStyle(img).visibility);

test("recoloring a translucent photo shows one layer that keeps its alpha", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: translucentPng(),
  });
  await ready(page);
  await expect(page.locator(".swatch")).toHaveCount(4);
  await expect(page.locator(".source-frame > img")).toHaveAttribute(
    "alt",
    "logo.png",
  );
  expect(await photoVisibility(page)).toBe("visible");

  await page.locator(".swatch-select").nth(0).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(layer(page)).toHaveAttribute("data-active", "true");
  await expect(layer(page)).toHaveAttribute("data-recolor-draws", /^[1-9]/);
  // The recolored canvas replaces the original instead of covering it.
  await expect.poll(() => photoVisibility(page)).toBe("hidden");

  // The canvas itself is as transparent as the photo was.
  const alpha = await layer(page).evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(canvas, 0, 0);
    const { data } = context.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    );
    return data[3];
  });
  expect(Math.abs(alpha - ALPHA)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Reset to extracted" }).click();
  await expect(layer(page)).toHaveAttribute("data-active", "false");
  await expect.poll(() => photoVisibility(page)).toBe("visible");
});
