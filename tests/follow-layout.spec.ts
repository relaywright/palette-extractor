import { test, expect, type Page } from "@playwright/test";
import { ready, settled } from "./helpers";

const PHONE = { width: 390, height: 844 };

async function openAdjust(page: Page, index: number) {
  await page.locator(".swatch-select").nth(index).click();
  await page.locator(".swatch.selected .adjust-button").click();
  await expect(page.locator(".adjust-panel")).toBeVisible();
}

/** Viewport rows of the photo, the Adjust panel, its Hue slider and the tab
    bar. */
function phoneRects(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    };
    return {
      frame: rect(".source-frame"),
      panel: rect(".adjust-panel"),
      hue: rect("#adjust-hue"),
      nav: rect(".workbench-nav"),
      height: innerHeight,
    };
  });
}

test.describe("phone", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("Adjust docks above the tab bar with the photo in view above it", async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    await settled(page);
    await page.evaluate(() => document.fonts.ready);
    // The fifth swatch sits below the photo, so the page has to scroll back.
    await page.locator(".swatch-select").nth(4).scrollIntoViewIfNeeded();
    await openAdjust(page, 4);
    await expect
      .poll(async () => {
        const r = await phoneRects(page);
        return {
          docked: Math.abs(r.panel.bottom - r.nav.top) <= 1,
          navAtBottom: r.nav.bottom <= r.height + 1,
          photoShown: r.frame.top >= 0 && r.frame.bottom <= r.panel.top,
          hueShown: r.hue.bottom <= r.panel.bottom,
        };
      })
      .toEqual({
        docked: true,
        navAtBottom: true,
        photoShown: true,
        hueShown: true,
      });
    // Nothing is stranded beneath the panel: the page's last line scrolls
    // clear of it.
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const panel = document.querySelector(".adjust-panel")!;
          const last = document.querySelector(".site-footer")!;
          return (
            last.getBoundingClientRect().bottom <=
            panel.getBoundingClientRect().top + 1
          );
        }),
      )
      .toBe(true);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".adjust-panel")).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        flag: "adjusting" in document.documentElement.dataset,
        dock: document.documentElement.style.getPropertyValue("--adjust-dock"),
      })),
    ).toEqual({ flag: false, dock: "" });
  });

  test("a tool sheet covers the docked panel, which returns when it closes", async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    await settled(page);
    await openAdjust(page, 1);
    await page
      .locator(".workbench-nav")
      .getByRole("tab", { name: "Contrast check" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-sheet", "open");
    await expect(page.locator(".adjust-panel")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).toHaveAttribute("data-sheet", "closed");
    await expect(page.locator(".adjust-panel")).toBeVisible();
  });

  test("the color-vision badge rides above the docked panel", async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    await settled(page);
    await page.getByRole("tab", { name: "Contrast check" }).click();
    await page.getByRole("radio", { name: "Deuteranopia" }).check();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cvd-indicator")).toBeVisible();
    await openAdjust(page, 1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const badge = document
            .querySelector(".cvd-indicator")!
            .getBoundingClientRect();
          const panel = document
            .querySelector(".adjust-panel")!
            .getBoundingClientRect();
          const nav = document
            .querySelector(".workbench-nav")!
            .getBoundingClientRect();
          // Docked, with the badge its usual 12px above it.
          return (
            Math.abs(panel.bottom - nav.top) <= 1 &&
            Math.abs(panel.top - badge.bottom - 12) <= 1
          );
        }),
      )
      .toBe(true);
  });

  test("Upload sits on the first screen and opens the file picker", async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    const upload = page
      .locator(".source-panel > .section-label")
      .getByRole("button", { name: "Upload", exact: true });
    await expect(upload).toBeInViewport({ ratio: 1 });
    const chooser = page.waitForEvent("filechooser");
    await upload.click();
    await chooser;
  });
});

test.describe("desktop", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ])
    test(`the photo column stays in view as the palette grows at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await ready(page);
      await settled(page);
      await page
        .getByRole("button", { name: "Compare RGB and Perceptual" })
        .click();
      await openAdjust(page, 1);
      const sourceTop = () =>
        page.evaluate(() =>
          Math.round(
            document.querySelector(".source-panel")!.getBoundingClientRect()
              .top,
          ),
        );
      await page.evaluate(() => scrollTo(0, 500));
      await expect.poll(sourceTop).toBe(24);
      // The photo and the open panel are both on screen at once.
      await expect(page.locator(".source-frame")).toBeInViewport({ ratio: 1 });
      await expect(page.locator("#adjust-hue")).toBeInViewport();
    });

  test("the stuck photo column fits the shortest window it sticks in", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 700 });
    await page.goto("/");
    await ready(page);
    // The link form is the column's tallest state.
    await page.getByRole("button", { name: /Use URL/ }).click();
    await page
      .getByRole("button", { name: "Compare RGB and Perceptual" })
      .click();
    await openAdjust(page, 1);
    // Just past the point where the column sticks.
    await page.evaluate(() => {
      const top = document
        .querySelector(".workspace")!
        .getBoundingClientRect().top;
      scrollTo(0, scrollY + top);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const box = document
            .querySelector(".source-panel")!
            .getBoundingClientRect();
          return { top: Math.round(box.top), fits: box.bottom <= innerHeight };
        }),
      )
      .toEqual({ top: 24, fits: true });
  });

  test("a short window leaves the photo column in the page flow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 650 });
    await page.goto("/");
    await ready(page);
    await page
      .getByRole("button", { name: "Compare RGB and Perceptual" })
      .click();
    expect(
      await page
        .locator(".source-panel")
        .evaluate((el) => getComputedStyle(el).position),
    ).toBe("static");
  });

  test("Replace keeps its quiet label on wide screens", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await expect(
      page
        .locator(".source-panel > .section-label")
        .getByRole("button", { name: "Replace", exact: true }),
    ).toBeVisible();
  });
});
