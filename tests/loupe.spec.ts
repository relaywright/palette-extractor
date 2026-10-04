import { test, expect, type Page } from "@playwright/test";
import { ready, stageDone } from "./helpers";
import {
  GRADIENT,
  HALVES,
  hexes,
  lockedCount,
  noAxeViolations,
  photoView,
  upload,
  WIDTHS,
} from "./touch-checks";

// A 1000 by 1 photo of narrow colored stripes. The quantizer sees it as a
// 320 by 1 raster, whose proportions differ from the photo's, so placing
// picks by the raster's would choose other stripes than the page shows.
const STRIPES = [
  "#c8321e",
  "#f4c300",
  "#2a9d5c",
  "#1e64c8",
  "#8a2bd6",
  "#ffffff",
];
const THIN = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1">` +
    Array.from(
      { length: 334 },
      (_, i) =>
        `<rect x="${i * 3}" width="3" height="1" fill="${STRIPES[i % STRIPES.length]}"/>`,
    ).join("") +
    `</svg>`,
);

const layer = (page: Page) => page.locator(".photo-pick");
const loupeHex = (page: Page) => page.locator(".loupe-hex");
const note = (page: Page) => page.locator(".pin-note");

async function open(page: Page, name: string, image: Buffer) {
  await page.goto("/");
  await ready(page);
  await stageDone(page);
  await upload(page, name, image);
  await photoView(page);
}

test("the loupe shows the hex under the pointer and lights its swatch", async ({
  page,
}) => {
  await open(page, "halves.svg", HALVES);
  await expect(loupeHex(page)).toHaveCount(0);
  await layer(page).hover({ position: { x: 120, y: 160 } });
  await expect(loupeHex(page)).toHaveText("#c8321e");
  const picked = page.locator(".swatch[data-picked]");
  await expect(picked).toHaveCount(1);
  await expect(picked.locator(".swatch-info code")).toHaveText("#c8321e");

  await layer(page).hover({ position: { x: 480, y: 160 } });
  await expect(loupeHex(page)).toHaveText("#1e64c8");
  await expect(picked.locator(".swatch-info code")).toHaveText("#1e64c8");

  await page.mouse.move(2, 2);
  await expect(loupeHex(page)).toHaveCount(0);
  await expect(page.locator(".swatch[data-picked]")).toHaveCount(0);
});

test("clicking the photo pins that exact pixel color", async ({ page }) => {
  await open(page, "gradient.svg", GRADIENT);
  await layer(page).hover({ position: { x: 210, y: 90 } });
  const hex = (await loupeHex(page).innerText()).toLowerCase();
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  expect(await hexes(page)).not.toContain(hex);
  await layer(page).click({ position: { x: 210, y: 90 } });
  await expect(note(page)).toHaveText(`Pinned ${hex}.`);
  await expect(lockedCount(page)).toHaveCount(1);
  await ready(page);
  expect((await hexes(page))[0]).toBe(hex);
  // Pinning the same color again says so and changes nothing.
  await layer(page).click({ position: { x: 210, y: 90 } });
  await expect(note(page)).toContainText("already pinned");
  await expect(lockedCount(page)).toHaveCount(1);
});

test("a full palette says so instead of pinning", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, "gradient.svg", GRADIENT);
  for (let i = 0; i < 10; i++) {
    await layer(page).click({
      position: { x: 40 + i * 52, y: 60 + (i % 3) * 80 },
    });
    await expect(note(page)).toContainText("Pinned");
    await expect(lockedCount(page)).toHaveCount(i + 1);
    await ready(page);
  }
  await expect(page.locator(".swatch")).toHaveCount(10);
  await layer(page).click({ position: { x: 300, y: 30 } });
  await expect(note(page)).toHaveText(
    "The palette is full at 10 colors. Unlock one to pin another.",
  );
  await expect(lockedCount(page)).toHaveCount(10);
});

test("the keyboard path pins too", async ({ page }) => {
  await open(page, "gradient.svg", GRADIENT);
  await layer(page).focus();
  await expect(loupeHex(page)).toBeVisible();
  const start = await loupeHex(page).innerText();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(loupeHex(page)).not.toHaveText(start);
  const near = await loupeHex(page).innerText();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(loupeHex(page)).not.toHaveText(near);
  const hex = (await loupeHex(page).innerText()).toLowerCase();
  await page.keyboard.press("Enter");
  await expect(note(page)).toContainText("Pinned");
  await expect(lockedCount(page)).toHaveCount(1);
  await ready(page);
  expect((await hexes(page))[0]).toBe(hex);
  await page.keyboard.press("Escape");
  await expect(layer(page)).not.toBeFocused();
  await expect(loupeHex(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Photo", exact: true }),
  ).toBeFocused();
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("taps pick only while Pick a color is on", async ({ page }) => {
    await open(page, "gradient.svg", GRADIENT);
    await layer(page).scrollIntoViewIfNeeded();
    const box = (await layer(page).boundingBox())!;
    const tap = (fx: number) =>
      page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * 0.5);
    await tap(0.4);
    await page.waitForTimeout(400);
    await expect(lockedCount(page)).toHaveCount(0);
    await expect(note(page)).toHaveText("");

    const toggle = page.getByRole("button", { name: "Pick a color" });
    await toggle.tap();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await tap(0.4);
    await expect(note(page)).toContainText("Pinned");
    await expect(lockedCount(page)).toHaveCount(1);
  });
});

test("reduced motion does not change picking", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "halves.svg", HALVES);
  await layer(page).hover({ position: { x: 120, y: 160 } });
  await expect(loupeHex(page)).toHaveText("#c8321e");
});

for (const size of WIDTHS)
  test(`the loupe has no accessibility violations at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await open(page, "gradient.svg", GRADIENT);
    await layer(page).scrollIntoViewIfNeeded();
    await layer(page).hover({ position: { x: 200, y: 120 } });
    await expect(loupeHex(page)).toBeVisible();
    await noAxeViolations(page);
    await layer(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".pick-ring")).toBeVisible();
    await noAxeViolations(page);
    await layer(page).click({ position: { x: 200, y: 120 } });
    await expect(note(page)).toContainText("Pinned");
    await noAxeViolations(page);
  });

/** Presses an edit key on a swatch until its hex changes, `times` over. */
async function nudge(page: Page, index: number, key: string, times = 3) {
  await page.locator(".swatch-select").nth(index).focus();
  for (let i = 0; i < times; i++) {
    const before = (await hexes(page))[index];
    await page.keyboard.press(key);
    await expect.poll(async () => (await hexes(page))[index]).not.toBe(before);
  }
}

/** Each swatch on screen, in order: its hex, whether it is pinned, whether it is marked edited. */
const swatchStates = (page: Page) =>
  page.locator(".swatch").evaluateAll((swatches) =>
    swatches.map((swatch) => ({
      hex: swatch
        .querySelector(".swatch-info code")!
        .textContent!.toLowerCase(),
      locked: !!swatch.querySelector(".lock-button.is-locked"),
      edited: !!swatch.querySelector(".edit-marker"),
    })),
  );

const settleFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );

const channels = (hex: string) =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

const inside = (
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1;

test("the loupe reads the recolored photo, and pins what it shows", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await stageDone(page);
  await upload(page, "halves.svg", HALVES);
  const red = (await hexes(page)).indexOf("#c8321e");
  expect(red).toBeGreaterThanOrEqual(0);
  await nudge(page, red, "Shift+ArrowRight");
  const edited = (await hexes(page))[red];
  expect(edited).not.toBe("#c8321e");
  await photoView(page);

  await layer(page).hover({ position: { x: 120, y: 160 } });
  await expect(loupeHex(page)).toHaveText(edited);
  // The recolored pixels still belong to the swatch they came from.
  await expect(
    page.locator(".swatch[data-picked] .swatch-info code"),
  ).toHaveText(edited);
  await layer(page).hover({ position: { x: 480, y: 160 } });
  await expect(loupeHex(page)).toHaveText("#1e64c8");

  await layer(page).click({ position: { x: 120, y: 160 } });
  await expect(note(page)).toHaveText(`Pinned ${edited}.`);
});

test("the loupe only ever shows the recolored color while the recolor is prepared", async ({
  page,
}) => {
  await open(page, "halves.svg", HALVES);
  const red = (await hexes(page)).indexOf("#c8321e");
  await nudge(page, red, "Shift+ArrowRight");
  const edited = (await hexes(page))[red];
  await photoView(page);
  // Every hex the loupe puts on screen from here on.
  await page.evaluate(() => {
    const shown = new Set<string>();
    (window as unknown as { shown: Set<string> }).shown = shown;
    new MutationObserver(() => {
      const text = document.querySelector(".loupe-hex")?.textContent;
      if (text) shown.add(text.toLowerCase());
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await layer(page).hover({ position: { x: 120, y: 160 } });
  await expect(loupeHex(page)).toHaveText(edited);
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => [
      ...(window as unknown as { shown: Set<string> }).shown,
    ]),
  ).toEqual([edited]);
});

test("pinning a color keeps the edits on the swatches that stay", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  await nudge(page, 3, "Shift+ArrowRight");
  const edited = (await hexes(page))[3];
  await expect(page.locator(".edit-marker")).toHaveCount(1);

  await layer(page).hover({ position: { x: 210, y: 90 } });
  const pinnedHex = (await loupeHex(page).innerText()).toLowerCase();
  await layer(page).click({ position: { x: 210, y: 90 } });
  await expect(lockedCount(page)).toHaveCount(1);
  await ready(page);
  await expect(page.locator(".edit-marker")).toHaveCount(1);
  expect(await hexes(page)).toContain(edited);
  // The marker and the edited color stay together, and off the new pin.
  const after = await swatchStates(page);
  expect(after.find((swatch) => swatch.locked)).toEqual({
    hex: pinnedHex,
    locked: true,
    edited: false,
  });
  expect(after.find((swatch) => swatch.edited)?.hex).toBe(edited);
});

test("a pin taken from an edited swatch's own region lands on the pin, not on that edit", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  const extracted = (await hexes(page))[3];
  await nudge(page, 3, "Shift+ArrowRight");
  const edited = (await hexes(page))[3];
  // The photo pixel closest to the swatch's extracted color.
  const frame = (await layer(page).boundingBox())!;
  let nearest = { hex: "", x: 0, distance: Infinity };
  for (let step = 1; step < 20; step++) {
    const x = (frame.width * step) / 20;
    await layer(page).hover({ position: { x, y: 90 } });
    await settleFrames(page);
    const hex = (await loupeHex(page).innerText()).toLowerCase();
    const distance = Math.hypot(
      ...channels(hex).map((v, i) => v - channels(extracted)[i]),
    );
    if (distance < nearest.distance) nearest = { hex, x, distance };
  }
  await layer(page).click({ position: { x: nearest.x, y: 90 } });
  await expect(lockedCount(page)).toHaveCount(1);
  await ready(page);
  const after = await swatchStates(page);
  const pin = after.find((swatch) => swatch.locked)!;
  expect(pin.hex).toBe(nearest.hex);
  expect(pin.edited).toBe(false);
  // Whatever edit survives is still on a swatch showing it.
  for (const swatch of after.filter((entry) => entry.edited))
    expect(swatch.hex).toBe(edited);
});

test("changing the sort while a pin is still being extracted keeps the edits", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  // A swatch far from the middle of the photo, which is what gets pinned.
  await nudge(page, 0, "Shift+ArrowRight");
  const edited = (await hexes(page))[0];
  await expect(page.locator(".edit-marker")).toHaveCount(1);
  await layer(page).focus();
  await expect(loupeHex(page)).toBeVisible();
  // Both in one turn of the event loop, so the pin's extraction cannot have
  // finished before the sort changes.
  await page.evaluate(() => {
    const photo = document.querySelector<HTMLElement>(".photo-pick")!;
    photo.focus();
    photo.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    const sort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort palette"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!.set!.call(sort, "hue");
    sort.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(lockedCount(page)).toHaveCount(1);
  await ready(page);
  await expect(page.locator(".edit-marker")).toHaveCount(1);
  expect(await hexes(page)).toContain(edited);
});

test("a color space change still starts the edits over", async ({ page }) => {
  await open(page, "gradient.svg", GRADIENT);
  await nudge(page, 3, "Shift+ArrowRight");
  await expect(page.locator(".edit-marker")).toHaveCount(1);
  await page.getByRole("radio", { name: "Perceptual" }).check();
  await ready(page);
  await expect(page.locator(".edit-marker")).toHaveCount(0);
});

test("a mouse release over the photo does not pin when the press began elsewhere", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  const frame = (await layer(page).boundingBox())!;
  const heading = (await page.locator("h1").boundingBox())!;
  await page.mouse.move(heading.x + 4, heading.y + heading.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(lockedCount(page)).toHaveCount(0);
  await expect(note(page)).toHaveText("");
  // A press and release on the photo still pins.
  await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await expect(lockedCount(page)).toHaveCount(1);
});

test("keyboard picking stays on the part of the photo that shows", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  await layer(page).focus();
  const frame = (await layer(page).boundingBox())!;
  const ring = page.locator(".pick-ring");
  for (const [key, times] of [
    ["Shift+ArrowUp", 14],
    ["Shift+ArrowDown", 28],
    ["Shift+ArrowLeft", 24],
    ["Shift+ArrowRight", 48],
  ] as const) {
    for (let i = 0; i < times; i++) await page.keyboard.press(key);
    const at = (await ring.boundingBox())!;
    const center = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
    expect(center.x, key).toBeGreaterThanOrEqual(frame.x);
    expect(center.x, key).toBeLessThanOrEqual(frame.x + frame.width);
    expect(center.y, key).toBeGreaterThanOrEqual(frame.y);
    expect(center.y, key).toBeLessThanOrEqual(frame.y + frame.height);
  }
});

test("a press on the photo released elsewhere does not turn a later drag onto the photo into a pin", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  const frame = (await layer(page).boundingBox())!;
  const middle = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
  // The page margin: bare, so a press there starts no text drag.
  const away = { x: 6, y: middle.y };
  // Press on the photo, drag off it and let go: the photo never sees the release.
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(away.x, away.y, { steps: 6 });
  await page.mouse.up();
  await page.evaluate(() => getSelection()?.removeAllRanges());
  // A later press elsewhere, dragged onto the photo, is still not a click on it.
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(lockedCount(page)).toHaveCount(0);
  await expect(note(page)).toHaveText("");
});

test("the keyboard cursor keeps marking its pixel when the page resizes", async ({
  page,
}) => {
  await open(page, "halves.svg", HALVES);
  await layer(page).focus();
  // Ten steps left of the middle: working pixel 140 of 320.
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  const ring = page.locator(".pick-ring");
  await expect(loupeHex(page)).toHaveText("#c8321e");
  const marked = async () => {
    const box = (await layer(page).boundingBox())!;
    const at = (await ring.boundingBox())!;
    const scale = Math.max(box.width / 600, box.height / 330);
    const offsetX = (box.width - 600 * scale) / 2;
    return {
      x: at.x + at.width / 2 - box.x,
      expected: offsetX + (140.5 / 320) * 600 * scale,
    };
  };
  const before = await marked();
  expect(Math.abs(before.x - before.expected)).toBeLessThan(2);
  await page.setViewportSize({ width: 620, height: 900 });
  await expect
    .poll(async () => {
      const after = await marked();
      return Math.abs(after.x - after.expected);
    })
    .toBeLessThan(2);
  await expect(loupeHex(page)).toHaveText("#c8321e");
});

test("a resize that crops the cursor's pixel moves the cursor and Enter pins what it shows", async ({
  page,
}) => {
  await open(page, "gradient.svg", GRADIENT);
  await layer(page).focus();
  // The far left column, which a narrower frame crops away.
  for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowLeft");
  await expect(loupeHex(page)).toBeVisible();
  const edge = (await loupeHex(page).innerText()).toLowerCase();
  await page.setViewportSize({ width: 420, height: 900 });
  await expect(loupeHex(page)).not.toHaveText(edge);
  const shown = (await loupeHex(page).innerText()).toLowerCase();
  await page.keyboard.press("Enter");
  await expect(note(page)).toHaveText(`Pinned ${shown}.`);
});

test("a thin photo is picked where the page shows it", async ({ page }) => {
  await open(page, "thin.svg", THIN);
  // A wide, short frame shows a few columns of the strip at once.
  await page.addStyleTag({ content: ".source-frame { height: 120px }" });
  const { width, height } = (await layer(page).boundingBox())!;
  expect(width / height).toBeGreaterThan(4);
  for (let step = 0; step <= 12; step++) {
    const x = 2 + ((width - 5) * step) / 12 + 0.37 * (step % 3);
    await layer(page).hover({ position: { x, y: height / 2 } });
    await expect(loupeHex(page)).toBeVisible();
    // The column of the 320 by 1 raster under the pointer when the photo is
    // placed by its own 1000 by 1 proportions.
    const expected = await page.evaluate((at) => {
      const photo = document.querySelector<HTMLImageElement>(
        ".source-frame > img",
      )!;
      const box = document
        .querySelector(".photo-pick")!
        .getBoundingClientRect();
      const scale = Math.max(
        box.width / photo.naturalWidth,
        box.height / photo.naturalHeight,
      );
      const offset = (box.width - photo.naturalWidth * scale) / 2;
      const column = Math.floor(
        ((at - offset) / (scale * photo.naturalWidth)) * 320,
      );
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.drawImage(photo, 0, 0, 320, 1);
      const [r, g, b] = context.getImageData(column, 0, 1, 1).data;
      return (
        "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
      );
    }, x);
    await expect(loupeHex(page), `at ${Math.round(x)}px`).toHaveText(expected);
  }
});

test("the color-vision simulation reaches the magnifier, not its hex", async ({
  page,
}) => {
  await open(page, "halves.svg", HALVES);
  await layer(page).hover({ position: { x: 120, y: 160 } });
  await expect(page.locator(".loupe canvas")).toHaveCSS("filter", "none");
  await page.getByRole("tab", { name: "Contrast check" }).click();
  await page.getByRole("radio", { name: "Protanopia" }).check();
  await layer(page).hover({ position: { x: 120, y: 160 } });
  await expect(page.locator(".loupe canvas")).toHaveCSS(
    "filter",
    'url("#cvd-protanopia")',
  );
  await expect(loupeHex(page)).toHaveText("#c8321e");
});

test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the loupe and its hex stay whole inside the short photo frame", async ({
    page,
  }) => {
    await open(page, "gradient.svg", GRADIENT);
    await layer(page).scrollIntoViewIfNeeded();
    const frame = (await layer(page).boundingBox())!;
    const check = async (label: string, point?: { x: number; y: number }) => {
      await expect(loupeHex(page), label).toBeVisible();
      const loupe = (await page.locator(".loupe").boundingBox())!;
      const hex = (await loupeHex(page).boundingBox())!;
      expect(inside(loupe, frame), `${label}: loupe in frame`).toBe(true);
      expect(inside(hex, frame), `${label}: hex in frame`).toBe(true);
      if (point)
        expect(
          point.x > loupe.x - 4 &&
            point.x < loupe.x + loupe.width + 4 &&
            point.y > loupe.y - 4 &&
            point.y < loupe.y + loupe.height + 4,
          `${label}: loupe is off the picked point`,
        ).toBe(false);
    };
    for (const y of [60, 90, 120, 150, 200]) {
      await layer(page).hover({ position: { x: 180, y } });
      await check(`hover at ${y}`, { x: frame.x + 180, y: frame.y + y });
    }
    await layer(page).focus();
    await check("keyboard focus");
  });
});

test("a photo the page cannot read says so, with or without edits, instead of waiting for colors", async ({
  page,
}) => {
  // Only the loupe's own read is refused, as it is for a photo the browser
  // marks as cross-origin; the extraction that built the palette still works.
  await page.addInitScript(() => {
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      ...args: Parameters<typeof read>
    ) {
      if (new Error().stack?.includes("Loupe"))
        throw new DOMException(
          "The canvas has been tainted by cross-origin data.",
          "SecurityError",
        );
      return read.apply(this, args);
    };
  });
  await open(page, "halves.svg", HALVES);
  await layer(page).click({ position: { x: 120, y: 160 } });
  await expect(note(page)).toHaveText("This photo cannot be sampled.");

  const red = (await hexes(page)).indexOf("#c8321e");
  await nudge(page, red, "Shift+ArrowRight", 1);
  await layer(page).click({ position: { x: 120, y: 160 } });
  await expect(note(page)).toHaveText("This photo cannot be sampled.");
  await expect(lockedCount(page)).toHaveCount(0);
});
