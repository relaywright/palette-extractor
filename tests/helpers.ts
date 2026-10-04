import { expect, type Page } from "@playwright/test";

export async function ready(page: Page) {
  await expect(page.locator("#workspace")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".swatch").first()).toBeVisible();
}

// Contrast is only meaningful once entrance animations finish; mid-fade
// swatches blend with the page and read darker than they render at rest.
export async function settled(page: Page) {
  await stageDone(page);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getTiming().iterations === Infinity,
      ),
  );
}

export async function stageDone(page: Page) {
  const host = page.locator(".stage-host");
  await expect
    .poll(
      async () => {
        const mode = await host.getAttribute("data-stage-mode");
        const phase = await host.getAttribute("data-stage-phase");
        return mode === "none" || phase === "intro" || phase === "done";
      },
      { timeout: 15000 },
    )
    .toBe(true);
  if ((await host.getAttribute("data-stage-mode")) === "none") return;
  if ((await host.getAttribute("data-stage-phase")) === "intro")
    await page.keyboard.press("Escape");
  await expect(host).toHaveAttribute("data-stage-phase", "done");
  await expect(host).toHaveAttribute("data-stage-done-at", /\d/);
}

export const svg = (color: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${color}"/></svg>`,
  );

/** Pixel size read from a PNG or JPEG header. Throws on anything else,
    so an HTML fallback page served in place of an image fails loudly. */
export function imageSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x89504e47) {
    if (bytes.length < 24) throw new Error("Truncated PNG header");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("Not a PNG or JPEG");
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("Corrupt JPEG marker");
    // Any number of 0xff fill bytes may precede a marker code.
    while (bytes[i + 1] === 0xff) i++;
    const marker = bytes[i + 1];
    if (marker === undefined) break;
    // Start of scan or end of image: image data, so no frame header follows.
    if (marker === 0xda || marker === 0xd9) break;
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) throw new Error("Truncated JPEG segment");
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2) throw new Error("Zero-length JPEG segment");
    if (i + 2 + length > bytes.length)
      throw new Error("Truncated JPEG segment");
    // Frame headers: SOF0 to SOF15 except DHT (c4), JPG (c8) and DAC (cc).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (length < 8) throw new Error("Truncated JPEG frame header");
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
      };
    }
    i += 2 + length;
  }
  throw new Error("No JPEG frame header");
}

/**
 * For tests that measure time on the page. CI runs them on their own after
 * the rest of the suite, so a busy runner does not decide whether they pass.
 */
export const TIMING = { tag: "@timing" };
