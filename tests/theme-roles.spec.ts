import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { contrastRatio, formatRatio } from "../src/lib/contrast";
import { ready, settled } from "./helpers";

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
};
const css = (hex: string) => {
  const { r, g, b } = toRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
};

const role = (page: Page, name: string) =>
  page.locator(".role-button").filter({ hasText: name });
const chips = (page: Page, name: string) =>
  page
    .getByRole("group", { name: `Choose a color for ${name}` })
    .locator("button");
const roleHex = async (page: Page, name: string) =>
  (await role(page, name).locator("code").innerText()).trim();
const preview = (page: Page) => page.locator(".brand-preview");
const surfaceOf = (page: Page) =>
  preview(page).evaluate((el) => getComputedStyle(el).backgroundColor);
const typeOf = (page: Page) =>
  preview(page).evaluate((el) => getComputedStyle(el).color);
const accentOf = (page: Page) =>
  page
    .locator(".brand-cta")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
const resetButton = (page: Page) =>
  page.getByRole("button", { name: "Reset roles" });

async function open(page: Page) {
  await page.goto("/");
  await ready(page);
  await expect(role(page, "Surface")).toBeVisible();
}

/** Opens a role's chips and finds one whose color the role does not have. */
async function otherChip(page: Page, name: string) {
  const picker = page.getByRole("group", {
    name: `Choose a color for ${name}`,
  });
  if (!(await picker.isVisible())) await role(page, name).click();
  const current = await roleHex(page, name);
  const hexes = await chips(page, name).evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label")!),
  );
  const index = hexes.findIndex((hex) => hex !== current);
  return { index, hex: hexes[index] };
}

test("each role takes the chip that is clicked and the contrast readouts follow", async ({
  page,
}) => {
  await open(page);
  await expect(resetButton(page)).toHaveCount(0);

  const surface = await otherChip(page, "Surface");
  await chips(page, "Surface").nth(surface.index).click();
  expect(await surfaceOf(page)).toBe(css(surface.hex));
  expect(await roleHex(page, "Surface")).toBe(surface.hex);

  const type = await otherChip(page, "Type");
  await chips(page, "Type").nth(type.index).click();
  expect(await typeOf(page)).toBe(css(type.hex));

  const accent = await otherChip(page, "Accent");
  await chips(page, "Accent").nth(accent.index).click();
  expect(await accentOf(page)).toBe(css(accent.hex));

  const textRatio = formatRatio(
    contrastRatio(toRgb(type.hex), toRgb(surface.hex)),
  );
  await expect(page.locator(".contrast-note")).toContainText(`${textRatio}:1`);
  const accentRatio = formatRatio(
    contrastRatio(toRgb(accent.hex), toRgb(surface.hex)),
  );
  await expect(page.locator(".accent-note")).toContainText(`${accentRatio}:1`);
});

test("Accent can be assigned with the keyboard alone", async ({ page }) => {
  await open(page);
  const before = await accentOf(page);
  await role(page, "Accent").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("group", { name: "Choose a color for Accent" }),
  ).toBeVisible();
  const hexes = await chips(page, "Accent").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label")!),
  );
  const target = hexes.findIndex((hex) => css(hex) !== before);
  // The first Tab from the role button lands on the first chip.
  for (let i = 0; i <= target; i++) await page.keyboard.press("Tab");
  await expect(chips(page, "Accent").nth(target)).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await accentOf(page)).toBe(css(hexes[target]));
  await expect(chips(page, "Accent").nth(target)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a chip dragged onto a role assigns it", async ({ page }) => {
  await open(page);
  const surface = await otherChip(page, "Surface");
  await chips(page, "Surface").nth(surface.index).dragTo(role(page, "Type"));
  expect(await typeOf(page)).toBe(css(surface.hex));
  expect(await roleHex(page, "Type")).toBe(surface.hex);
});

test("Reset roles restores the suggestion and then goes away", async ({
  page,
}) => {
  await open(page);
  const suggested = {
    surface: await roleHex(page, "Surface"),
    type: await roleHex(page, "Type"),
    accent: await roleHex(page, "Accent"),
  };
  const pick = await otherChip(page, "Accent");
  await chips(page, "Accent").nth(pick.index).click();
  expect(await roleHex(page, "Accent")).toBe(pick.hex);
  await resetButton(page).click();
  expect(await roleHex(page, "Surface")).toBe(suggested.surface);
  expect(await roleHex(page, "Type")).toBe(suggested.type);
  expect(await roleHex(page, "Accent")).toBe(suggested.accent);
  await expect(resetButton(page)).toHaveCount(0);
});

test("Reverse light and dark swaps surface and type and can be reset", async ({
  page,
}) => {
  await open(page);
  const [surface, type] = [await surfaceOf(page), await typeOf(page)];
  await page.getByRole("button", { name: "Reverse light & dark" }).click();
  expect(await surfaceOf(page)).toBe(type);
  expect(await typeOf(page)).toBe(surface);
  await resetButton(page).click();
  expect(await surfaceOf(page)).toBe(surface);
});

test("picks start over when a new photo loads", async ({ page }) => {
  await open(page);
  const pick = await otherChip(page, "Accent");
  await chips(page, "Accent").nth(pick.index).click();
  await expect(resetButton(page)).toBeVisible();
  await page.getByRole("button", { name: "Try Forest floor" }).click();
  await ready(page);
  await expect(resetButton(page)).toHaveCount(0);
});

test("Export this theme copies valid text in each format and confirms on the button", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const readClipboard = async () =>
    (await page.evaluate(() => navigator.clipboard.readText()))
      .split("\r\n")
      .join("\n");
  const exportButton = page.getByRole("button", { name: "Export this theme" });
  const copiedButton = page.getByRole("button", { name: "Copied" });
  const formats = page.getByRole("group", { name: "Theme export format" });
  const hexes = [
    await roleHex(page, "Surface"),
    await roleHex(page, "Type"),
    await roleHex(page, "Accent"),
  ];
  const names = [
    "surface",
    "text",
    "accent",
    "surface-inverse",
    "text-inverse",
    "accent-inverse",
  ];
  const expected = [hexes[0], hexes[1], hexes[2], hexes[1], hexes[0], hexes[2]];

  await formats.getByRole("button", { name: "CSS" }).click();
  await exportButton.click();
  await expect(copiedButton).toBeVisible();
  const cssText = await readClipboard();
  expect(cssText).toContain(":root {");
  const declarations = [...cssText.matchAll(/^ {2}--([a-z-]+): (.+);$/gm)];
  expect(declarations.map((m) => m[1])).toEqual(names);
  expect(declarations.map((m) => m[2])).toEqual(expected);
  for (const m of declarations) expect(m[2]).toMatch(/^#[0-9a-f]{6}$/);

  await formats.getByRole("button", { name: "Tailwind" }).click();
  await expect(exportButton).toBeVisible();
  await exportButton.click();
  await expect(copiedButton).toBeVisible();
  const tailwind = await readClipboard();
  expect(tailwind).toMatch(/@theme \{\n/);
  const tw = [
    ...tailwind.matchAll(/^ {2}--color-([a-z-]+): (#[0-9a-f]{6});$/gm),
  ];
  expect(tw.map((m) => m[1])).toEqual(names);
  expect(tailwind.trimEnd().endsWith("}")).toBe(true);

  await formats.getByRole("button", { name: "JSON" }).click();
  await expect(exportButton).toBeVisible();
  await exportButton.click();
  await expect(copiedButton).toBeVisible();
  const json = JSON.parse(await readClipboard());
  expect(Object.keys(json)).toEqual(names);
  expect(Object.values(json)).toEqual(expected);
});

test("exported variables follow the roles that were picked", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const pick = await otherChip(page, "Accent");
  await chips(page, "Accent").nth(pick.index).click();
  await page
    .getByRole("group", { name: "Theme export format" })
    .getByRole("button", { name: "JSON" })
    .click();
  await page.getByRole("button", { name: "Export this theme" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const json = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(json.accent).toBe(pick.hex);
  expect(json["accent-inverse"]).toBe(pick.hex);
});

test("the identity preview is one column on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await preview(page).scrollIntoViewIfNeeded();
  const result = await page.evaluate(() => {
    const box = document.querySelector(".brand-preview")!;
    const tracks = getComputedStyle(
      box.querySelector(".brand-body")!,
    ).gridTemplateColumns.split(" ");
    const text = box
      .querySelector(".brand-body > div:first-child")!
      .getBoundingClientRect();
    const art = box.querySelector(".brand-art")!.getBoundingClientRect();
    const footer = [...box.querySelector(".brand-bottom")!.children].map((el) =>
      el.getBoundingClientRect(),
    );
    const small: string[] = [];
    for (const el of box.querySelectorAll("*")) {
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
      );
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (own && size < 12) small.push(`${el.className} ${size}px`);
    }
    return {
      tracks: tracks.length,
      stacked: art.top >= text.bottom - 1,
      footerStacked: footer.every(
        (r, i) => i === 0 || r.top >= footer[i - 1].bottom - 1,
      ),
      small,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      boxOverflow: box.scrollWidth - box.clientWidth,
    };
  });
  expect(result.tracks).toBe(1);
  expect(result.stacked).toBe(true);
  expect(result.footerStacked).toBe(true);
  expect(result.small).toEqual([]);
  expect(result.pageOverflow).toBeLessThanOrEqual(0);
  expect(result.boxOverflow).toBeLessThanOrEqual(0);
});

for (const width of [390, 768, 1440]) {
  test(`axe passes with the role picker active at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await settled(page);
    await role(page, "Accent").click();
    await expect(chips(page, "Accent").first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.html),
      })),
    ).toEqual([]);
  });
}
