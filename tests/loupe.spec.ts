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
