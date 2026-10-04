import { test, expect, type Page } from "@playwright/test";
import { ready, stageDone } from "./helpers";
import { noAxeViolations, QUARTERS, upload, WIDTHS } from "./touch-checks";

const toggle = (page: Page) =>
  page.getByRole("button", {
    name: /Hide comparison|Compare RGB and Perceptual/,
  });
const rows = (page: Page) => page.locator(".space-compare-rows tr");

async function open(page: Page) {
  await page.goto("/");
  await ready(page);
  await stageDone(page);
}

test("compare rows line the two palettes up in columns", async ({ page }) => {
  await open(page);
  await expect(page.locator(".space-compare")).toHaveCount(0);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0).locator("th")).toHaveText("RGB");
  await expect(rows(page).nth(1).locator("th")).toHaveText("Perceptual");

  const states = await page
    .locator(".space-compare-rows tr")
    .evaluateAll((trs) =>
      trs.map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => td.dataset.state),
      ),
    );
  expect(states[0].length).toBeGreaterThanOrEqual(6);
  expect(states[0]).toHaveLength(states[1].length);
  // A color both spaces found sits in the same column of both rows.
  states[0].forEach((state, column) => {
    if (state === "same") expect(states[1][column]).toBe("same");
  });
  expect(states[0].filter((state) => state === "same").length).toBeGreaterThan(
    0,
  );
  // Colors only one space found are marked, and the other row leaves a gap.
  const changed = states.flat().filter((state) => state === "changed").length;
  const empty = states.flat().filter((state) => state === "empty").length;
  expect(changed).toBeGreaterThan(0);
  expect(empty).toBe(changed);
  await expect(page.locator(".space-compare-note")).toHaveText(
    /^Perceptual changes \d+ of \d+ colors\.$/,
  );

  await toggle(page).click();
  await expect(page.locator(".space-compare")).toHaveCount(0);
});

test("a column is either filled in both rows or marked and empty in one", async ({
  page,
}) => {
  await open(page);
  await toggle(page).click();
  await expect(rows(page)).toHaveCount(2);
  const columns = await page
    .locator(".space-compare-rows")
    .evaluate((table) => {
      const [first, second] = [...table.querySelectorAll("tr")].map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => ({
          state: td.dataset.state,
          color: td.querySelector("i")!.style.background,
        })),
      );
      return first.map((cell, i) => [cell, second[i]]);
    });
  for (const [rgb, oklab] of columns)
    if (rgb.state === "same") {
      expect(rgb.color).not.toBe("");
      expect(oklab.color).not.toBe("");
    } else expect([rgb.color, oklab.color]).toContain("");
});

test("when both spaces agree it says so instead of repeating the row", async ({
  page,
}) => {
  await open(page);
  await upload(page, "quarters.svg", QUARTERS);
  await toggle(page).click();
  await expect(page.locator(".space-compare-note")).toHaveText(
    "Same colors in both color spaces.",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).locator("th")).toHaveText("Both");
  await expect(page.locator(".space-compare-rows td")).toHaveCount(4);
});

for (const size of WIDTHS)
  test(`the comparison has no accessibility violations at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await open(page);
    await toggle(page).click();
    await expect(rows(page)).toHaveCount(2);
    await page.locator(".space-compare").scrollIntoViewIfNeeded();
    await noAxeViolations(page);
  });

test("the color-vision simulation reaches the comparison chips", async ({
  page,
}) => {
  await open(page);
  await toggle(page).click();
  await expect(rows(page)).toHaveCount(2);
  const chip = page.locator(".space-compare-rows td i").first();
  await expect(chip).toHaveCSS("filter", "none");
  await page.getByRole("tab", { name: "Contrast check" }).click();
  await page.getByRole("radio", { name: "Deuteranopia" }).check();
  await expect(chip).toHaveCSS("filter", 'url("#cvd-deuteranopia")');
});
