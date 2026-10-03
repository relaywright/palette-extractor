import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, settled } from "./helpers";

const swatchSelect = (page: Page, index: number) =>
  page.locator(".swatch-select").nth(index);

const hexes = (page: Page) =>
  page
    .locator(".swatch-info button")
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute("aria-label")!.replace("Copy ", "")),
    );

async function open(page: Page) {
  await page.goto("/");
  await ready(page);
  await settled(page);
}

// Presses an edit key on a swatch and waits for its hex to change.
async function nudge(page: Page, index: number, key: string, times = 1) {
  await swatchSelect(page, index).focus();
  for (let i = 0; i < times; i++) {
    const before = (await hexes(page))[index];
    await page.keyboard.press(key);
    await expect.poll(async () => (await hexes(page))[index]).not.toBe(before);
  }
}

test("the Adjust panel recolors a swatch and Reset restores the extracted hexes", async ({
  page,
}) => {
  await open(page);
  const extracted = await hexes(page);
  await swatchSelect(page, 1).click();
  await expect(
    page.getByRole("button", { name: "Reset to extracted" }),
  ).toHaveCount(0);

  await page.locator(".swatch.selected .adjust-button").click();
  await expect(page.locator(".adjust-panel")).toBeVisible();
  await expect(page.getByLabel("Lightness")).toBeFocused();
  await expect(page.getByLabel("Chroma")).toBeVisible();
  await expect(page.getByLabel("Hue")).toBeVisible();

  await page.getByLabel("Hue").fill("200");
  await expect.poll(async () => (await hexes(page))[1]).not.toBe(extracted[1]);
  const edited = await hexes(page);
  expect(edited[0]).toBe(extracted[0]);
  await expect(page.locator(".swatch.selected .edit-marker")).toHaveCount(1);
  await expect(swatchSelect(page, 1)).toHaveAttribute(
    "aria-label",
    /, edited$/,
  );
  await expect(page.locator(".edit-marker")).toHaveCount(1);

  await page.getByRole("button", { name: "Reset to extracted" }).click();
  expect(await hexes(page)).toEqual(extracted);
  await expect(page.locator(".edit-marker")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reset to extracted" }),
  ).toHaveCount(0);
});

test("an edited palette round-trips through a share link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await nudge(page, 2, "Shift+ArrowUp", 3);
  await nudge(page, 0, "Shift+ArrowRight", 4);
  const edited = await hexes(page);

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  for (const hex of edited) expect(link).toContain(hex.slice(1));

  await page.goto("about:blank");
  await page.goto(link);
  await ready(page);
  expect((await hexes(page)).sort()).toEqual([...edited].sort());
});

test("a keyboard alone can select, recolor, reset and copy", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const extracted = await hexes(page);

  await swatchSelect(page, 3).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".swatch").nth(3)).toHaveClass(/selected/);

  await nudge(page, 3, "Shift+ArrowUp", 2);
  await nudge(page, 3, "Shift+PageUp", 2);
  const edited = (await hexes(page))[3];
  expect(edited).not.toBe(extracted[3]);

  // Home on the swatch undoes that one color.
  await page.keyboard.press("Shift+Home");
  await expect.poll(async () => (await hexes(page))[3]).toBe(extracted[3]);
  await nudge(page, 3, "Shift+ArrowDown", 1);

  const reset = page.getByRole("button", { name: "Reset to extracted" });
  for (
    let i = 0;
    i < 40 && !(await reset.evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(reset).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await hexes(page)).toEqual(extracted);
  await expect(swatchSelect(page, 3)).toBeFocused();

  const copy = page.locator(".swatch-info button").nth(3);
  for (
    let i = 0;
    i < 12 && !(await copy.evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(copy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(copy).toContainText("Copied!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    extracted[3],
  );
});

test("the mockup and the export follow the edited palette", async ({
  page,
}) => {
  await open(page);
  const surface = (
    await page.locator(".context-panel code").first().innerText()
  ).trim();
  const index = (await hexes(page)).indexOf(surface);
  expect(index).toBeGreaterThanOrEqual(0);
  await expect(page.locator(".context-panel")).toContainText(surface);

  await nudge(page, index, "Shift+ArrowUp", 4);
  const edited = (await hexes(page))[index];
  expect(edited).not.toBe(surface);
  await expect(page.locator(".context-panel")).not.toContainText(surface);

  await page.getByRole("tab", { name: "Export palette" }).click();
  const code = page.locator(".code-window pre code");
  await expect(code).toContainText(edited);
  await expect(code).not.toContainText(surface);
});

for (const width of [390, 768, 1440]) {
  test(`the open Adjust panel and an edited swatch pass axe at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page);
    await swatchSelect(page, 1).click();
    await page.locator(".swatch.selected .adjust-button").click();
    const before = (await hexes(page))[1];
    await page.getByLabel("Hue").fill("120");
    await page.getByLabel("Chroma").fill("0.15");
    await expect.poll(async () => (await hexes(page))[1]).not.toBe(before);
    await expect(page.locator(".adjust-panel")).toBeVisible();
    await expect(page.locator(".edit-marker")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await settled(page);
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
