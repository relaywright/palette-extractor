import { test, expect } from "@playwright/test";
import { ready, settled, stageDone } from "./helpers";

test("opening Adjust brings the photo forward, where the recolor shows", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await settled(page);
  const photo = page.getByRole("button", { name: "Photo", exact: true });
  const cloud = page.getByRole("button", { name: "Color space", exact: true });
  await cloud.click();
  await expect(cloud).toHaveAttribute("aria-pressed", "true");

  await page.locator(".swatch-select").nth(1).click();
  await page.locator(".swatch.selected .adjust-button").click();
  await expect(page.locator(".adjust-panel")).toBeVisible();
  await expect(photo).toHaveAttribute("aria-pressed", "true");

  // Choosing the cloud again while adjusting is respected.
  await cloud.click();
  await page.getByLabel("Hue").fill("200");
  await expect(cloud).toHaveAttribute("aria-pressed", "true");
});

test("a new photo closes the Adjust panel", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await settled(page);
  await page.locator(".swatch-select").nth(0).click();
  await page.locator(".swatch.selected .adjust-button").click();
  await expect(page.locator(".adjust-panel")).toBeVisible();
  const next = page.getByRole("button", { name: /^Try / }).nth(1);
  await next.click();
  // The panel hides while the new colors load; it must not come back after.
  await expect(next).toHaveAttribute("aria-pressed", "true");
  await ready(page);
  await settled(page);
  await expect(page.locator(".adjust-panel")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`shortcut keys each sit on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await ready(page);
    await page.keyboard.press("?");
    const keys = page.locator(".shortcut-sheet kbd");
    await expect(keys.first()).toBeVisible();
    const heights = await keys.evaluateAll((all) =>
      all.map((key) => Math.round(key.getBoundingClientRect().height)),
    );
    expect(new Set(heights).size).toBe(1);
    // Alternatives are separate keys, not one long cap.
    await expect(keys.filter({ hasText: /^Page Up$/ })).toHaveCount(1);
    await expect(keys.filter({ hasText: / or / })).toHaveCount(0);
  });
}

test("the compare rows show the whole Perceptual label on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await ready(page);
  await settled(page);
  await page
    .getByRole("button", { name: "Compare RGB and Perceptual" })
    .click();
  const label = page.locator(".space-compare-rows th").last();
  await expect(label).toHaveText("Perceptual");
  const fits = await label.evaluate((th) => {
    const range = document.createRange();
    range.selectNodeContents(th);
    const text = range.getBoundingClientRect();
    const cell = th.nextElementSibling!.getBoundingClientRect();
    return text.right <= cell.left;
  });
  expect(fits).toBe(true);
});

test("with a color-vision preview on, the page's last controls scroll clear of its badge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await ready(page);
  await stageDone(page);
  await page.getByRole("tab", { name: "Contrast check" }).click();
  await page.getByRole("radio", { name: "Deuteranopia" }).check();
  await page.keyboard.press("Escape");
  const badge = page.locator(".cvd-indicator");
  await expect(badge).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const top = document
          .querySelector(".cvd-indicator")!
          .getBoundingClientRect().top;
        const shell = document.querySelector(".app-shell")!;
        // The lowest control in the page itself (fixed bars are not in it).
        const lowest = Math.max(
          ...[...shell.querySelectorAll("button, a, input, select")]
            .filter((el) => {
              const style = getComputedStyle(el);
              return (
                el.getClientRects().length > 0 &&
                style.visibility !== "hidden" &&
                !el.closest(".cvd-indicator, .tab-bar, [role=tablist], dialog")
              );
            })
            .map((el) => el.getBoundingClientRect().bottom),
        );
        return lowest <= top;
      }),
    )
    .toBe(true);
});

test("a photo that fails to load leaves the shown sample marked", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const shown = page.getByRole("button", { name: /^Try / }).first();
  await expect(shown).toHaveAttribute("aria-pressed", "true");
  await page.locator("input[type=file]").setInputFiles({
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(shown).toHaveAttribute("aria-pressed", "true");
});
