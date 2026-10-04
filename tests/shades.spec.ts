import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready } from "./helpers";

const openShades = async (page: Page) => {
  await page.getByRole("tab", { name: "Export palette" }).click();
  await page.getByRole("radio", { name: "Shades" }).check();
  await expect(page.locator(".shade-row").first()).toBeVisible();
};

test("the Shades view draws a scale and a lightness curve per color", async ({
  page,
}) => {
  await page.goto("/#p=b4643c.788c3c.141e78");
  await ready(page);
  await openShades(page);
  await expect(page.locator(".shade-row")).toHaveCount(3);
  for (const row of await page.locator(".shade-row").all()) {
    await expect(row.locator(".shade-chip")).toHaveCount(11);
    await expect(row.locator(".shade-stop")).toHaveText([
      /^50/,
      /^100/,
      /^200/,
      /^300/,
      /^400/,
      /^500/,
      /^600/,
      /^700/,
      /^800/,
      /^900/,
      /^950/,
    ]);
    await expect(row.locator("svg.shade-curve")).toHaveAttribute("role", "img");
    await expect(row.locator("svg.shade-curve circle")).toHaveCount(11);
    await expect(row.locator(".shade-chip", { hasText: "yours" })).toHaveCount(
      1,
    );
  }
});

test("a shade copies with confirmation on that chip, in hex and Display P3", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#p=b4643c.788c3c.141e78");
  await ready(page);
  await openShades(page);
  const chip = page.locator(".shade-row").first().locator(".shade-chip").nth(5);
  const label = (await chip.getAttribute("aria-label"))!;
  const hex = label.match(/#[0-9a-f]{6}/)![0];
  await chip.click();
  await expect(chip).toContainText("Copied!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(hex);
  await expect(page.locator(".shade-chip", { hasText: "Copied!" })).toHaveCount(
    1,
  );

  await page.getByRole("radio", { name: "Display P3" }).check();
  await expect(chip).toContainText("color(display-p3");
  await chip.click();
  await expect(chip).toContainText("Copied!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^color\(display-p3 [\d. ]+\)$/,
  );
});

test("Include shades adds full scales to the export, off by default", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#p=b4643c.788c3c.141e78");
  await ready(page);
  await page.getByRole("tab", { name: "Export palette" }).click();
  const code = page.locator(".code-window pre");
  await expect(code).toContainText("--palette-1: #b4643c;");
  await expect(code).not.toContainText("--palette-1-50");
  const plain = await code.innerText();

  const toggle = page.getByRole("checkbox", { name: /Include shades/ });
  await toggle.check();
  await expect(code).toContainText("--palette-1-50:");
  await expect(code).toContainText("--palette-3-950:");
  expect(await code.innerText()).toContain(plain.replace(/\n}$/, ""));

  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("--palette-2-500:");
  expect(copied.match(/--palette-\d+-\d+:/g)).toHaveLength(33);

  await page.getByLabel("Export format").selectOption("tailwind");
  await expect(code).toContainText("--color-palette-2-500:");
  await page.getByLabel("Export format").selectOption("svg");
  await expect(toggle).toBeDisabled();
  await expect(code).not.toContainText("palette-1-50");

  await page.getByLabel("Export format").selectOption("css");
  await toggle.uncheck();
  expect(await code.innerText()).toBe(plain);
});

for (const width of [390, 768, 1440]) {
  test(`the Shades view passes axe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#p=b4643c.788c3c.141e78");
    await ready(page);
    await openShades(page);
    const check = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.html),
      }));
    expect(await check()).toEqual([]);

    await page.getByRole("radio", { name: "Display P3" }).check();
    expect(await check()).toEqual([]);

    await page.getByRole("radio", { name: "Code" }).check();
    await page.getByRole("checkbox", { name: /Include shades/ }).check();
    expect(await check()).toEqual([]);
  });

  test(`the Shades view with a simulation on passes axe at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#p=b4643c.788c3c.141e78");
    await ready(page);
    await page.getByRole("tab", { name: "Contrast check" }).click();
    await page.getByRole("radio", { name: "Tritanopia" }).check();
    // On a phone the badge stays hidden while the tool sheet is open, so the
    // simulation is checked on the page itself.
    await expect(page.locator("html")).toHaveAttribute("data-cvd", /\w/);
    if (width > 580) await expect(page.locator(".cvd-indicator")).toBeVisible();
    await openShades(page);
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
