import { test, expect, type Page } from "@playwright/test";
import { ready } from "./helpers";

// Edits, selection, locks and theme roles belong to a swatch, not to its
// color or its position, so these cases pull the three apart: a color edited
// to equal its neighbor, a repeated color, and a re-sorted palette.

const swatchSelect = (page: Page, index: number) =>
  page.locator(".swatch-select").nth(index);
const hexes = (page: Page) =>
  page
    .locator(".swatch-info button")
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute("aria-label")!.replace("Copy ", "")),
    );
const selectedIndex = (page: Page) =>
  page
    .locator(".swatch")
    .evaluateAll((els) =>
      els.findIndex((el) => el.classList.contains("selected")),
    );

const css = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const role = (page: Page, name: string) =>
  page.locator(".role-button").filter({ hasText: name });
const roleHex = async (page: Page, name: string) =>
  (await role(page, name).locator("code").innerText()).trim();
const accentOf = (page: Page) =>
  page
    .locator(".brand-cta")
    .evaluate((el) => getComputedStyle(el).backgroundColor);

const REPEATED = "/#p=ee5533.ee5533.336699.99cc33";

const fourColors = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect width="50" height="50" fill="#cc2244"/>
    <rect x="50" width="50" height="50" fill="#22aa88"/>
    <rect y="50" width="50" height="50" fill="#4466dd"/>
    <rect x="50" y="50" width="50" height="50" fill="#ddaa22"/>
  </svg>`,
);

test("a color recolored to match the swatch after it keeps its edit and its selection", async ({
  page,
}) => {
  await page.goto("/#p=000000.ffffff.336699.99cc33");
  await ready(page);
  await swatchSelect(page, 0).click();
  await page.locator(".swatch.selected .adjust-button").click();

  // Black at full lightness is the same white as the swatch after it.
  await page.getByLabel("Lightness").fill("100");
  await expect.poll(async () => (await hexes(page))[0]).toBe("#ffffff");
  expect(await selectedIndex(page)).toBe(0);

  await page.getByLabel("Lightness").fill("60");
  await expect
    .poll(async () => (await hexes(page))[0])
    .not.toMatch(/^#(000000|ffffff)$/);
  const shown = await hexes(page);
  expect(shown[1]).toBe("#ffffff");
  expect(shown.slice(2)).toEqual(["#336699", "#99cc33"]);
  expect(await selectedIndex(page)).toBe(0);
});

test("adjusting one of two identical swatches leaves the other as it was", async ({
  page,
}) => {
  await page.goto(REPEATED);
  await ready(page);
  await swatchSelect(page, 1).click();
  await page.locator(".swatch.selected .adjust-button").click();
  await page.getByLabel("Hue").fill("200");

  await expect.poll(async () => (await hexes(page))[1]).not.toBe("#ee5533");
  expect(await hexes(page)).toEqual([
    "#ee5533",
    (await hexes(page))[1],
    "#336699",
    "#99cc33",
  ]);
  await expect(page.locator(".edit-marker")).toHaveCount(1);
  await expect(
    page.locator(".swatch").nth(1).locator(".edit-marker"),
  ).toHaveCount(1);
});

test("unlocking one of two identical swatches keeps the other locked", async ({
  page,
}) => {
  await page.goto(REPEATED);
  await ready(page);
  // The link's colors start out pinned; a photo makes pinning available.
  await page.locator("input[type=file]").setInputFiles({
    name: "four.svg",
    mimeType: "image/svg+xml",
    buffer: fourColors,
  });
  await ready(page);
  await expect(page.locator(".swatch")).toHaveCount(4);
  const locks = page.locator('.lock-button[aria-pressed="true"]');
  await expect(locks).toHaveCount(4);

  await page.locator(".lock-button").nth(1).click();
  await ready(page);
  await expect(locks).toHaveCount(3);
  await expect(page.locator(".swatch")).toHaveCount(4);
  const shown = await hexes(page);
  expect(shown.filter((hex) => hex === "#ee5533")).toHaveLength(1);
});
