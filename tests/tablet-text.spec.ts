import { test, expect, type Page } from "@playwright/test";
import { ready } from "./helpers";

const TABS = ["In context", "Contrast check", "How it works", "Export palette"];
// Illustrations draw their own type, and screen-reader text is not shown.
const ILLUSTRATION = ".sr-only, .brand-preview, .low-contrast-art";
const FLOOR = 12;

/** Every visible text node under the floor, plus small form controls,
    clipped swatch values and horizontal scroll. */
function problems(page: Page) {
  return page.evaluate(
    ({ ILLUSTRATION, FLOOR }) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent!.trim();
        const el = n.parentElement!;
        if (!text || el.closest(ILLUSTRATION)) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < FLOOR)
          out.push(
            `${size}px "${text.slice(0, 24)}" (${el.tagName.toLowerCase()}.${el.className} in ${el.parentElement!.className})`,
          );
      }
      for (const control of document.querySelectorAll(
        "select, input[type=url]",
      ))
        if (
          control.getBoundingClientRect().width &&
          parseFloat(getComputedStyle(control).fontSize) < FLOOR
        )
          out.push(
            `${control.tagName.toLowerCase()} ${control.getAttribute("aria-label") ?? ""}`,
          );
      for (const button of document.querySelectorAll(
        ".swatch-info button, .inspector button",
      ))
        if (button.scrollWidth > button.clientWidth + 0.5)
          out.push(`clipped "${button.textContent!.trim()}"`);
      for (const label of document.querySelectorAll(".section-label"))
        if (label.scrollWidth > label.clientWidth + 0.5)
          out.push(`overflowing header "${label.textContent!.slice(0, 20)}"`);
      if (document.documentElement.scrollWidth > innerWidth)
        out.push("horizontal scroll");
      return out;
    },
    { ILLUSTRATION, FLOOR },
  );
}

for (const width of [581, 600, 699, 700, 720, 759, 760, 820, 850]) {
  test(`at ${width}px no text is under ${FLOOR}px and nothing overflows`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    const found = new Set<string>();
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      for (const format of ["HEX", "RGB", "HSL"]) {
        await page.getByRole("button", { name: format, exact: true }).click();
        (await problems(page)).forEach((p) =>
          found.add(`${tab}/${format}: ${p}`),
        );
      }
    }
    expect([...found]).toEqual([]);
  });
}

// Saturated mid-lightness colors make the longest hsl() and rgb() strings.
const WIDEST = "#p=ff00ff.00ffff.ffff00.ff0080.8000ff.00ff80";

for (const width of [581, 640, 699, 700, 760, 850]) {
  test(`at ${width}px the longest values stay whole in every format`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${WIDEST}`);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    for (const format of ["HEX", "RGB", "HSL"]) {
      await page.getByRole("button", { name: format, exact: true }).click();
      const clipped = await page
        .locator(".swatch-info button")
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.scrollWidth > button.clientWidth + 0.5)
            .map((button) => button.textContent),
        );
      expect(clipped, format).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        format,
      ).toBe(true);
    }
  });
}
