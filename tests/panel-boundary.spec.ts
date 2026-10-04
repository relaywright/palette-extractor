import { test, expect } from "@playwright/test";
import { ready } from "./helpers";

// The development server runs the app under Strict Mode, which mounts, unmounts
// and mounts every component once.
test("a failed panel still shows its notice, and its build check still lands, under Strict Mode", async ({
  page,
}) => {
  await page.route("**/src/components/ExportPanel.tsx*", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await ready(page);
  const root = new URL(page.url()).origin;
  await page.route(
    (url) => url.origin === root && url.pathname === "/",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><script type="module" src="/src/newer-main.tsx"></script></head><body></body></html>',
      }),
  );
  await page.getByRole("tab", { name: "Export palette" }).click();
  const notice = page.getByRole("alert").filter({ hasText: "of the app" });
  await expect(notice).toBeFocused();
  await expect(notice).toContainText(
    "A newer version of the app is available.",
  );
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  await expect(page.locator(".swatch")).toHaveCount(6);
});
