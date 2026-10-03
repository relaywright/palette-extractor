import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, settled } from "./helpers";

const TYPES = ["protanopia", "deuteranopia", "tritanopia"] as const;
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];

const openContrast = async (page: Page) => {
  await page.getByRole("tab", { name: "Contrast check" }).click();
  await expect(page.locator(".cvd-control")).toBeVisible();
};

const photo = (page: Page) => page.locator(".source-frame > img");

/** Mean absolute difference per channel (0 to 255) between two PNGs. */
const meanDiff = (page: Page, a: Buffer, b: Buffer) =>
  page.evaluate(
    async ([x, y]) => {
      const load = async (base64: string) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${base64}`)).blob(),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [p, q] = [await load(x), await load(y)];
      let total = 0;
      for (let i = 0; i < p.length; i++) total += Math.abs(p[i] - q[i]);
      return total / p.length;
    },
    [a.toString("base64"), b.toString("base64")],
  );

/** Pixels of the photo with no hover or focus ring from the controls on it. */
const photoPixels = async (page: Page) => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  return photo(page).screenshot();
};

const axeViolations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
    (v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }),
  );

for (const type of TYPES) {
  test(`${type} turns on and off, recolors the photo and passes axe`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await ready(page);
    await settled(page);
    await openContrast(page);
    // The Photo view holds still, so its pixels can be compared exactly.
    await page.getByRole("button", { name: "Photo", exact: true }).click();
    await expect(photo(page)).toHaveCSS("opacity", "1");
    const root = page.locator("html");
    const before = await photoPixels(page);
    await expect(root).not.toHaveAttribute("data-cvd", /.*/);

    await page.getByRole("radio", { name: new RegExp(type, "i") }).check();
    await expect(root).toHaveAttribute("data-cvd", type);
    await expect(page.locator(".cvd-indicator")).toContainText(
      `Simulating ${type}`,
    );
    await expect
      .poll(async () => meanDiff(page, before, await photoPixels(page)))
      .toBeGreaterThan(3);
    for (const target of [
      ".swatch-grid",
      ".source-frame > img",
      ".stage-points",
    ])
      await expect(page.locator(target).first()).toHaveCSS(
        "filter",
        `url("#cvd-${type}")`,
      );
    expect(await axeViolations(page)).toEqual([]);

    // The simulation follows the user to the mockup on another tab.
    await page.getByRole("tab", { name: "In context" }).click();
    await expect(page.locator(".brand-preview")).toHaveCSS(
      "filter",
      `url("#cvd-${type}")`,
    );
    await expect(page.locator(".cvd-indicator")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(root).not.toHaveAttribute("data-cvd", /.*/);
    await expect(page.locator(".cvd-indicator")).toHaveCount(0);
    await expect(page.locator(".brand-preview")).toHaveCSS("filter", "none");
    await expect
      .poll(async () => meanDiff(page, before, await photoPixels(page)))
      .toBeLessThan(0.5);
  });
}

test("the None option also turns the simulation off, by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await openContrast(page);
  await page.getByRole("radio", { name: "Protanopia" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-cvd", "protanopia");
  await page.getByRole("radio", { name: "None" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).not.toHaveAttribute("data-cvd", /.*/);
  await expect(page.locator(".cvd-indicator")).toHaveCount(0);
});

test("two colors that blur together under deuteranopia are named", async ({
  page,
}) => {
  await page.goto("/#p=b4643c.788c3c.141e78");
  await ready(page);
  await openContrast(page);
  const result = page.locator(".cvd-result");
  await expect(result).toBeEmpty();

  await page.getByRole("radio", { name: "Deuteranopia" }).check();
  await expect(result).toContainText("Under deuteranopia");
  await expect(result.locator("li")).toHaveCount(1);
  await expect(result.locator("li")).toContainText("#b4643c");
  await expect(result.locator("li")).toContainText("#788c3c");

  // The dark blue stays clearly apart, and so does everything with no
  // simulation on.
  await page.getByRole("radio", { name: "Tritanopia" }).check();
  await expect(result).toContainText(
    "every pair of your colors stays distinct",
  );
  await page.getByRole("radio", { name: "None" }).check();
  await expect(result).toBeEmpty();
});

for (const width of [390, 768, 1440]) {
  test(`a simulation passes axe at ${width}px on the Contrast tab`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#p=b4643c.788c3c.141e78");
    await ready(page);
    await openContrast(page);
    await page.getByRole("radio", { name: "Deuteranopia" }).check();
    await expect(page.locator(".cvd-result li")).toHaveCount(1);
    await expect(page.locator(".cvd-indicator")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}

test("the recolored photo is simulated, and the original beneath it is not filtered twice", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await ready(page);
  await settled(page);
  await page.locator(".swatch-select").nth(1).focus();
  await page.keyboard.press("Shift+ArrowUp");
  const layer = page.locator(".recolor-layer");
  await expect(layer).toHaveAttribute("data-active", "true");
  await openContrast(page);
  await page.getByRole("radio", { name: "Deuteranopia" }).check();
  await expect(layer).toHaveCSS("filter", 'url("#cvd-deuteranopia")');
  await expect(photo(page)).toHaveCSS("filter", "none");

  // Resetting the edit brings the original photo back as the filtered layer.
  await page.getByRole("tab", { name: "In context" }).click();
  await page.getByRole("button", { name: "Reset to extracted" }).click();
  await expect(layer).toHaveAttribute("data-active", "false");
  await expect(photo(page)).toHaveCSS("filter", 'url("#cvd-deuteranopia")');
});

test("on a phone the simulation badge sits above the tab bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#p=b4643c.788c3c.141e78");
  await ready(page);
  await page.evaluate(() => scrollTo(0, 400));
  await page.getByRole("tab", { name: "Contrast check" }).click();
  await page.getByRole("radio", { name: "Deuteranopia" }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tabpanel")).toBeHidden();
  const indicator = page.locator(".cvd-indicator");
  await expect(indicator).toBeVisible();
  const bar = page.getByRole("tablist", { name: "Palette tools" });
  for (const top of [400, 0]) {
    await page.evaluate((y) => scrollTo(0, y), top);
    const [a, b] = [
      (await indicator.boundingBox())!,
      (await bar.boundingBox())!,
    ];
    expect(a.y + a.height, `scrolled to ${top}`).toBeLessThanOrEqual(b.y);
  }
});
