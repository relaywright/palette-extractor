import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, stageDone } from "./helpers";

/** A smooth sweep of hue across and lightness down: every pixel its own color. */
export const GRADIENT = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="330"><defs>` +
    `<linearGradient id="h" x1="0" x2="1"><stop offset="0" stop-color="#d62828"/>` +
    `<stop offset=".25" stop-color="#f4a300"/><stop offset=".5" stop-color="#2a9d5c"/>` +
    `<stop offset=".75" stop-color="#2a6fd6"/><stop offset="1" stop-color="#8a2bd6"/></linearGradient>` +
    `<linearGradient id="v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/>` +
    `<stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient></defs>` +
    `<rect width="600" height="330" fill="url(#h)"/><rect width="600" height="330" fill="url(#v)"/></svg>`,
);

/** Two flat halves, so a pick lands on a known color. */
export const HALVES = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="330">` +
    `<rect width="300" height="330" fill="#c8321e"/><rect x="300" width="300" height="330" fill="#1e64c8"/></svg>`,
);

/** Four flat quarters: both color spaces find exactly these colors. */
export const QUARTERS = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="330">` +
    `<rect width="300" height="165" fill="#c8321e"/><rect x="300" width="300" height="165" fill="#1e64c8"/>` +
    `<rect y="165" width="300" height="165" fill="#2a9d5c"/><rect x="300" y="165" width="300" height="165" fill="#f4c300"/></svg>`,
);

export async function upload(page: Page, name: string, buffer: Buffer) {
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "image/svg+xml",
    buffer,
  });
  await ready(page);
  await stageDone(page);
}

export async function photoView(page: Page) {
  await page
    .getByRole("group", { name: "Source view" })
    .getByRole("button", { name: "Photo", exact: true })
    .click();
  await expect(page.locator(".photo-pick")).toBeVisible();
}

/** Pinned (locked) swatches on screen. */
export const lockedCount = (page: Page) =>
  page.locator(".lock-button.is-locked");

/** Hex values the palette shows, lowercase. */
export const hexes = async (page: Page) =>
  (await page.locator(".swatch-info code").allTextContents()).map((hex) =>
    hex.toLowerCase(),
  );

export async function noAxeViolations(page: Page) {
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

export const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];
