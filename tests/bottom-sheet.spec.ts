import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, settled } from "./helpers";

const PHONE = { width: 390, height: 844 };
const TABS = ["In context", "Contrast check", "How it works", "Export palette"];

const bar = (page: Page) =>
  page.getByRole("tablist", { name: "Palette tools" });
const panel = (page: Page) => page.getByRole("tabpanel");
const sheet = (page: Page) => page.locator(".sheet");

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      id: el?.id ?? "",
      inSheet: !!el?.closest(".sheet"),
      role: el?.getAttribute("role") ?? "",
    };
  });

/** The bar slides in once the page has scrolled, so most tests scroll first. */
async function openOnPhone(page: Page, { scrolled = true } = {}) {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  if (scrolled) {
    await page.evaluate(() => scrollTo(0, 400));
    await expect(page.locator("html")).toHaveAttribute("data-tab-bar", "on");
  }
}

test.describe("on a phone", () => {
  test("the bar stays out of the first screen, which shows every swatch", async ({
    page,
  }) => {
    await openOnPhone(page, { scrolled: false });
    await expect(page.locator("html")).toHaveAttribute("data-tab-bar", "off");
    await expect(bar(page)).not.toBeInViewport();
    const lowest = await page
      .locator(".swatch-info button")
      .evaluateAll((buttons) =>
        Math.max(...buttons.map((b) => b.getBoundingClientRect().bottom)),
      );
    expect(lowest).toBeLessThanOrEqual(PHONE.height);
  });

  test("a tab can be chosen without scrolling first", async ({ page }) => {
    await openOnPhone(page, { scrolled: false });
    await page.getByRole("tab", { name: "Export palette" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-tab-bar", "on");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    // Focus is back on the tab, so the bar stays where it was reached.
    await expect(bar(page)).toBeInViewport();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.locator("html")).toHaveAttribute("data-tab-bar", "off");
  });

  test("the tool tabs are a bar at the bottom and the panel starts closed", async ({
    page,
  }) => {
    await openOnPhone(page);
    const box = (await bar(page).boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(PHONE.height, 0);
    expect(box.width).toBeCloseTo(PHONE.width, 0);
    expect(
      await bar(page).evaluate((el) => getComputedStyle(el).position),
    ).toBe("fixed");
    for (const name of TABS)
      await expect(page.getByRole("tab", { name })).toBeVisible();
    await expect(panel(page)).toBeHidden();
    await expect(
      page.locator('[role="tab"][aria-selected="true"]'),
    ).toHaveCount(0);
    // The bar never sits on top of the page's own last line.
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const footer = (await page.locator(".site-footer").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(box.y + 1);
  });

  test("choosing a tab opens its panel above the bar and moves focus in", async ({
    page,
  }) => {
    await openOnPhone(page);
    await page.getByRole("tab", { name: "Contrast check" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Contrast check" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(panel(page)).toHaveAttribute(
      "aria-labelledby",
      "tab-contrast",
    );
    await expect(page.getByRole("heading", { level: 2 }).last()).toBeVisible();
    expect(await focused(page)).toMatchObject({
      inSheet: true,
      role: "tabpanel",
    });
    const sheetBox = (await sheet(page).boundingBox())!;
    const barBox = (await bar(page).boundingBox())!;
    expect(sheetBox.y + sheetBox.height).toBeCloseTo(barBox.y, 0);
    expect(sheetBox.y).toBeGreaterThan(0);
  });

  test("Escape closes the sheet and returns focus to its tab", async ({
    page,
  }) => {
    await openOnPhone(page);
    await page.getByRole("tab", { name: "Export palette" }).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    expect((await focused(page)).id).toBe("tab-export");
    await expect(
      page.locator('[role="tab"][aria-selected="true"]'),
    ).toHaveCount(0);
  });

  test("the close button, the same tab and the dimmed page also close it", async ({
    page,
  }) => {
    await openOnPhone(page);
    await page.getByRole("tab", { name: "How it works" }).click();
    await expect(panel(page)).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(panel(page)).toBeHidden();
    expect((await focused(page)).id).toBe("tab-algorithm");

    await page.getByRole("tab", { name: "In context" }).click();
    await expect(panel(page)).toBeVisible();
    await page.getByRole("tab", { name: "In context" }).click();
    await expect(panel(page)).toBeHidden();

    await page.getByRole("tab", { name: "In context" }).click();
    await expect(panel(page)).toBeVisible();
    await page.mouse.click(PHONE.width / 2, 40);
    await expect(panel(page)).toBeHidden();
  });

  test("a downward swipe on the handle closes it; a short pull does not", async ({
    page,
  }) => {
    await openOnPhone(page);
    await page.getByRole("tab", { name: "Contrast check" }).click();
    await expect(panel(page)).toBeVisible();
    const handle = (await page.locator(".sheet-handle").boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + 12;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 4 });
    await page.mouse.up();
    await expect(panel(page)).toBeVisible();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 140, { steps: 8 });
    await page.mouse.up();
    await expect(panel(page)).toBeHidden();
    expect(
      await sheet(page).evaluate((el) => el.getAttribute("style") ?? ""),
    ).toBe("");
  });

  test("the tablist keeps its keyboard behavior", async ({ page }) => {
    await openOnPhone(page);
    await page.getByRole("tab", { name: "In context" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    expect((await focused(page)).id).toBe("tab-context");
    // Arrows move between tabs without opening anything.
    await page.keyboard.press("ArrowRight");
    expect((await focused(page)).id).toBe("tab-contrast");
    await expect(panel(page)).toBeHidden();
    await page.keyboard.press("End");
    expect((await focused(page)).id).toBe("tab-export");
    await page.keyboard.press("Home");
    expect((await focused(page)).id).toBe("tab-context");
    // With the sheet open they switch its panel.
    await page.keyboard.press("Space");
    await expect(panel(page)).toBeVisible();
    await page.getByRole("tab", { name: "In context" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(panel(page)).toHaveAttribute(
      "aria-labelledby",
      "tab-contrast",
    );
    await expect(
      page.getByRole("tab", { name: "Contrast check" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("a copy gives a short tick where the device supports it", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const win = window as unknown as { __ticks: unknown[] };
      win.__ticks = [];
      navigator.vibrate = (pattern) => {
        win.__ticks.push(pattern);
        return true;
      };
    });
    await openOnPhone(page);
    await page.locator(".swatch-info button").first().click();
    await expect(page.locator(".swatch-info button code").first()).toHaveText(
      "Copied!",
    );
    expect(
      await page.evaluate(
        () => (window as unknown as { __ticks: unknown[] }).__ticks,
      ),
    ).toEqual([10]);
  });

  test("copying works where vibration does not exist", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "vibrate", { value: undefined });
    });
    await openOnPhone(page);
    await page.locator(".swatch-info button").first().click();
    await expect(page.locator(".swatch-info button code").first()).toHaveText(
      "Copied!",
    );
  });

  test("the open sheet passes axe on every tab", async ({ page }) => {
    await openOnPhone(page);
    await settled(page);
    for (const name of TABS) {
      await page.getByRole("tab", { name }).click();
      await expect(panel(page)).toBeVisible();
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.html),
        })),
        name,
      ).toEqual([]);
    }
  });
});

for (const width of [768, 1440]) {
  test(`at ${width}px the tabs and panel stay in the page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await ready(page);
    expect(
      await bar(page).evaluate((el) => getComputedStyle(el).position),
    ).not.toBe("fixed");
    await expect(panel(page)).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "In context" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
}

test("Escape closes only the topmost overlay on a phone", async ({ page }) => {
  await openOnPhone(page);
  await page.getByRole("tab", { name: "Export palette" }).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("?");
  const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcuts).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shortcuts).toBeHidden();
  await expect(panel(page)).toBeVisible();
  expect((await focused(page)).inSheet).toBe(true);
  // With nothing above it, Escape closes the tool sheet as before.
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  expect((await focused(page)).id).toBe("tab-export");
});
