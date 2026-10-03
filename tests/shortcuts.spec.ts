import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, settled } from "./helpers";

async function open(page: Page) {
  await page.goto("/");
  await ready(page);
  // Keys land on the page, not on a leftover focus inside a control.
  await page.locator("body").click({ position: { x: 2, y: 2 } });
}

const swatchButtons = (page: Page) => page.locator(".swatch-select");
const hexOf = async (page: Page, index: number) =>
  (await swatchButtons(page).nth(index).getAttribute("aria-label"))!
    .split(", ")
    .pop()!;
const readClipboard = async (page: Page) =>
  (await page.evaluate(() => navigator.clipboard.readText()))
    .split("\r\n")
    .join("\n");

async function expectSelected(page: Page, index: number) {
  await expect(page.locator(".swatch.selected")).toHaveCount(1);
  await expect(swatchButtons(page).nth(index)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".inspector button").first()).toHaveAttribute(
    "aria-label",
    `Copy ${await hexOf(page, index)} from inspector`,
  );
}

test("3 selects the third swatch and the inspector follows", async ({
  page,
}) => {
  await open(page);
  await expectSelected(page, 0);
  await page.keyboard.press("3");
  await expectSelected(page, 2);
  await page.keyboard.press("1");
  await expectSelected(page, 0);
});

test("a digit past the last swatch changes nothing", async ({ page }) => {
  await open(page);
  await page.keyboard.press("2");
  await page.keyboard.press("9");
  await page.keyboard.press("0");
  await expectSelected(page, 1);
});

test("C copies the selected swatch in the current format and confirms on it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page.keyboard.press("3");
  await page.keyboard.press("c");
  expect(await readClipboard(page)).toBe(await hexOf(page, 2));
  await expect(
    page.locator(".swatch.selected .swatch-info button"),
  ).toContainText("Copied!");

  await page
    .getByRole("group", { name: "Color value format" })
    .getByRole("button", { name: "RGB" })
    .click();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("c");
  expect(await readClipboard(page)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
});

test("Shift+C copies the palette and S copies the link, each confirming on its own button", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page.keyboard.press("Shift+C");
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await readClipboard(page)).toContain(":root {");
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  expect(await readClipboard(page)).toContain("#");
  expect(await readClipboard(page)).toMatch(/^http/);
});

test("? opens the sheet, Escape closes it and focus returns", async ({
  page,
}) => {
  await open(page);
  const opener = swatchButtons(page).nth(1);
  await opener.focus();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("dialog.shortcut-sheet"),
    ),
  ).toBe(true);
  for (const action of [
    "Select swatch 1 to 9",
    "Select swatch 10",
    "Copy the selected color",
    "Copy the whole palette",
    "Copy the share link",
    "Show this list",
  ])
    await expect(sheet).toContainText(action);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("the sheet closes with its Close button and returns focus", async ({
  page,
}) => {
  await open(page);
  const opener = page.getByRole("button", { name: "Use URL" });
  await opener.focus();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("shortcuts pause while typing and with a modifier held or the sheet open", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Use URL" }).click();
  const field = page.getByLabel("Public image URL");
  await expect(field).toBeFocused();
  await page.keyboard.type("3c?s");
  await expect(field).toHaveValue("3c?s");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectSelected(page, 0);

  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Control+3");
  await page.keyboard.press("Alt+3");
  await expectSelected(page, 0);

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("3");
  await page.keyboard.press("Escape");
  await expectSelected(page, 0);
});

for (const width of [390, 768, 1440]) {
  test(`axe passes with the shortcut sheet open at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await settled(page);
    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
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
