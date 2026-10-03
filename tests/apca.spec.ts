import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready } from "./helpers";

const openContrast = async (page: Page) => {
  await page.getByRole("tab", { name: "Contrast check" }).click();
  await expect(page.locator(".contrast-pair").first()).toBeVisible();
};

test("every pair shows APCA beside its WCAG ratio", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openContrast(page);
  const pairs = await page.locator(".contrast-pair").count();
  expect(pairs).toBeGreaterThan(0);
  await expect(page.locator(".apca-line")).toHaveCount(pairs);
  for (const line of await page.locator(".apca-line").all()) {
    await expect(line).toContainText(/Lc -?\d+/);
    await expect(line).toContainText("APCA, WCAG 3 draft");
  }
  await expect(page.locator(".contrast-ratio").first()).toContainText(/:1$/);
});

test("a pair that passes WCAG 2 but reads faint in APCA says so", async ({
  page,
}) => {
  // Black on #aaa is 9.4:1 (AAA) but only Lc 58.
  await page.goto("/#p=000000.aaaaaa");
  await ready(page);
  await openContrast(page);
  await expect(page.locator(".apca-line")).toContainText("Lc 58");
  await expect(page.locator(".apca-note")).toContainText(
    "Meets WCAG 2 for body text, but APCA rates it Lc 58",
  );
});

test("a pair that misses WCAG 2 AA but is fine in APCA says so", async ({
  page,
}) => {
  // #888 on white is 3.5:1 but Lc 63.
  await page.goto("/#p=888888.ffffff");
  await ready(page);
  await openContrast(page);
  await expect(page.locator(".apca-line")).toContainText("Lc 63");
  await expect(page.locator(".apca-note")).toContainText(
    "Misses WCAG 2 for body text, but APCA rates it Lc 63",
  );
});

test("pairs where both methods agree get no note", async ({ page }) => {
  await page.goto("/#p=111111.ffffff");
  await ready(page);
  await openContrast(page);
  await expect(page.locator(".apca-line")).toContainText("APCA");
  await expect(page.locator(".apca-note")).toHaveCount(0);
});

for (const width of [390, 768, 1440]) {
  test(`the Contrast tab with APCA notes passes axe at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#p=000000.aaaaaa.888888.ffffff");
    await ready(page);
    await openContrast(page);
    await expect(page.locator(".apca-note").first()).toBeVisible();
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
