import { test, expect } from "@playwright/test";
import { ready } from "./helpers";

const LINK = "/#p=ee5533.ee5533.336699.99cc33";

test("a share link with a repeated color selects exactly one swatch", async ({
  page,
}) => {
  await page.goto(LINK);
  await ready(page);
  await expect(page.locator(".swatch")).toHaveCount(4);
  await expect(page.locator(".swatch.selected")).toHaveCount(1);
  await expect(page.locator('.swatch-select[aria-pressed="true"]')).toHaveCount(
    1,
  );
  await expect(page.locator(".swatch").nth(0)).toHaveClass(/selected/);
});

test("selecting the second of two identical swatches leaves the first unselected", async ({
  page,
}) => {
  await page.goto(LINK);
  await ready(page);
  await page.locator(".swatch-select").nth(1).click();
  await expect(page.locator(".swatch.selected")).toHaveCount(1);
  await expect(page.locator(".swatch").nth(1)).toHaveClass(/selected/);
  await expect(page.locator(".swatch").nth(0)).not.toHaveClass(/selected/);
});

test("copying a repeated color confirms on the swatch that was used", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(LINK);
  await ready(page);
  await page.locator(".swatch-info button").nth(1).click();
  await expect(page.getByText("Copied!")).toHaveCount(1);
  await expect(
    page.locator(".swatch").nth(1).getByText("Copied!"),
  ).toBeVisible();
});
