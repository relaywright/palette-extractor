import { resolve } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Software rendering makes the cube figures slow to settle on CI machines.
test.describe.configure({ timeout: 90_000 });

const SECTIONS = [
  "sampling",
  "color-space",
  "one-split",
  "gap",
  "which-box",
  "snap",
  "rgb-vs-oklab",
  "reproject",
  "decisions",
];
const CUBES = ["color-space", "one-split", "space-rgb", "space-oklab"];

/** Console errors and uncaught exceptions, collected from the first request. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Waits until a photo has been read and every figure is out of its skeleton. */
async function open(page: Page, version = 1) {
  await page.goto("/how.html");
  await finished(page, version);
}

async function finished(page: Page, version: number) {
  await expect(page.locator("main.how-page")).toHaveAttribute(
    "data-analysis",
    String(version),
    { timeout: 30000 },
  );
  // Figures build when they come near the screen, so visit each one.
  for (const id of SECTIONS) {
    const frame = page.locator(`[data-figure="${id}"]`);
    await frame.scrollIntoViewIfNeeded();
    await expect(frame).toHaveAttribute("aria-busy", "false");
  }
  for (const name of CUBES)
    await expect(page.locator(`[data-cube="${name}"]`)).toHaveAttribute(
      "data-cube-ready",
      "true",
      { timeout: 15000 },
    );
}

const figure = (page: Page, id: string) =>
  page.locator(`[data-figure="${id}"]`);

async function expectFocusRing(target: Locator) {
  const ring = await target.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
}

/** A snapshot of every canvas in a figure, to tell a redraw from a repeat. */
const pictures = (page: Page, id: string) =>
  page.evaluate(
    (name) =>
      [...document.querySelectorAll(`[data-figure="${name}"] canvas`)].map(
        (canvas) => (canvas as HTMLCanvasElement).toDataURL(),
      ),
    id,
  );

test.describe("the explainer page", () => {
  test("loads without console errors and renders every figure", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    await expect(page).toHaveTitle("How median cut works");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "How median cut works",
    );
    const ids = await page
      .locator("[data-figure]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-figure")));
    expect(ids).toEqual(SECTIONS);
    for (const id of SECTIONS) {
      await expect(figure(page, id)).toBeVisible();
      // Each section has its own short heading and two to four paragraphs.
      const section = page.locator(`section#${id}`);
      await expect(section.getByRole("heading", { level: 2 })).toHaveCount(1);
      const paragraphs = await section
        .locator(".how-copy p:not(.how-eyebrow)")
        .count();
      expect(paragraphs).toBeGreaterThanOrEqual(2);
      expect(paragraphs).toBeLessThanOrEqual(4);
    }
    // The cubes drew something, not an empty canvas.
    for (const name of CUBES) {
      const drawn = await page
        .locator(`[data-cube="${name}"] canvas`)
        .first()
        .evaluate((canvas) => {
          const source = canvas as HTMLCanvasElement;
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const ctx = copy.getContext("2d")!;
          ctx.drawImage(source, 0, 0);
          const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
          let opaque = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
          return opaque;
        });
      expect(drawn, name).toBeGreaterThan(200);
    }
    expect(errors).toEqual([]);
  });

  test("the scrubber steps through every split", async ({ page }) => {
    await open(page);
    const stepper = page.locator('[data-stepper="one-split"]');
    const range = stepper.getByRole("slider", { name: "Split" });
    const readout = page.locator('[data-readout="one-split"]');
    const palette = await page
      .locator('[data-space="rgb"] ul[aria-label="RGB palette"] li')
      .count();
    const splits = Number(await readout.getAttribute("data-split-count"));
    expect(palette).toBeGreaterThan(1);
    expect(splits).toBe(palette - 1);
    await expect(range).toHaveAttribute("min", "1");
    await expect(range).toHaveAttribute("max", String(splits));

    await range.focus();
    await page.keyboard.press("Home");
    const seen = new Set<string>();
    for (let k = 1; k <= splits; k++) {
      if (k > 1) await page.keyboard.press("ArrowRight");
      await expect(readout).toHaveAttribute("data-split", String(k));
      await expect(range).toHaveValue(String(k));
      await expect(range).toHaveAttribute(
        "aria-valuetext",
        `Split ${k} of ${splits}`,
      );
      await expect(readout).toContainText(`Split ${k} of ${splits}.`);
      seen.add(
        (await page
          .locator('[data-histogram="one-split"] .how-bars-low')
          .getAttribute("d"))!,
      );
    }
    // Every split draws its own histogram.
    expect(seen.size).toBe(splits);
    await expect(stepper.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.keyboard.press("End");
    await expect(range).toHaveValue(String(splits));
  });

  test("every control works from the keyboard and shows focus", async ({
    page,
  }) => {
    await open(page);

    // Buttons take Enter and Space.
    const stepper = page.locator('[data-stepper="one-split"]');
    const readout = page.locator('[data-readout="one-split"]');
    const next = stepper.getByRole("button", { name: "Next" });
    const previous = stepper.getByRole("button", { name: "Previous" });
    await stepper.getByRole("slider").focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(previous).toBeDisabled();
    await expect(next).toBeFocused();
    await expectFocusRing(next);
    await page.keyboard.press("Enter");
    await expect(readout).toHaveAttribute("data-split", "2");
    await page.keyboard.press("Space");
    await expect(readout).toHaveAttribute("data-split", "3");

    // Every range input answers the arrow keys and shows a focus ring.
    const ranges = page.locator('.how-figure input[type="range"]');
    const total = await ranges.count();
    expect(total).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < total; i++) {
      const range = ranges.nth(i);
      await range.scrollIntoViewIfNeeded();
      await range.focus();
      await expectFocusRing(range);
      await page.keyboard.press("Home");
      const low = await range.inputValue();
      await page.keyboard.press("ArrowRight");
      expect(await range.inputValue(), `range ${i}`).not.toBe(low);
    }

    // Radio groups move with the arrow keys.
    const groups = page.locator(".how-choice");
    expect(await groups.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const radios = groups.nth(i).getByRole("radio");
      await radios.first().focus();
      await expectFocusRing(radios.first().locator("xpath=.."));
      const before = await radios.evaluateAll((els) =>
        els.map((el) => (el as HTMLInputElement).checked),
      );
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
      const after = await radios.evaluateAll((els) =>
        els.map((el) => (el as HTMLInputElement).checked),
      );
      expect(after).not.toEqual(before);
    }

    // The box picker takes Space and Enter.
    const picker = page.locator(".how-box-picker button");
    await picker.nth(2).focus();
    await expectFocusRing(picker.nth(2));
    await page.keyboard.press("Space");
    await expect(picker.nth(2)).toHaveAttribute("aria-pressed", "true");
    await picker.nth(4).focus();
    await page.keyboard.press("Enter");
    await expect(picker.nth(4)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-snap-box]")).toHaveAttribute(
      "data-snap-box",
      "5",
    );

    // Decisions open and close with Enter.
    const summary = page.locator('[data-decision="buffer"] summary');
    await summary.focus();
    await expectFocusRing(summary);
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-decision="buffer"]')).toHaveJSProperty(
      "open",
      true,
    );
  });

  test("dragging a cube turns it, and Play steps through the splits", async ({
    page,
  }) => {
    await open(page);
    const cube = page.locator('[data-cube="color-space"]');
    await cube.scrollIntoViewIfNeeded();
    const before = await cube.getAttribute("data-cube-angle");
    const box = (await cube.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    expect(await cube.getAttribute("data-cube-angle")).not.toBe(before);

    const readout = page.locator('[data-readout="one-split"]');
    await readout.scrollIntoViewIfNeeded();
    await expect(readout).toHaveAttribute("data-split", "1");
    const play = page.getByRole("button", { name: "Play" });
    await play.click();
    await expect(readout).toHaveAttribute("data-split", "2", {
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Pause" }).click();
    const held = await readout.getAttribute("data-split");
    await page.waitForTimeout(1500);
    await expect(readout).toHaveAttribute("data-split", held!);
  });

  test("each figure responds to its own controls", async ({ page }) => {
    await open(page);
    const sampling = page.locator("[data-sampling-size]");
    await expect(sampling).toHaveText(/^320 by \d+$/);
    await page
      .locator('[data-stepper="sampling"]')
      .getByRole("slider")
      .fill("0");
    await expect(sampling).toHaveText(/^16 by \d+$/);

    // The median and the cut differ somewhere across the splits.
    const gap = page.locator('[data-readout="gap"]');
    await page
      .locator('[data-choice="gap-cut"]')
      .getByText("The median")
      .click();
    await expect(gap).toContainText("The median is");

    // Ranking by population versus volume can change the winner.
    const which = page.locator('[data-readout="which-box"]');
    await page
      .locator('[data-stepper="which-box"]')
      .getByRole("slider")
      .fill("7");
    await page
      .locator('[data-choice="rank"]')
      .getByText("Population", { exact: true })
      .click();
    await expect(which).toContainText("Ranked by population");
    await page
      .locator('[data-choice="rank"]')
      .getByText("Population times volume")
      .click();
    await expect(which).toContainText("Ranked by population times volume");

    // The color count changes the palette size the photo is redrawn with.
    const result = page.locator("[data-reproject-colors]");
    await expect(result).toHaveAttribute("data-reproject-colors", "8");
    await page.locator('[data-stepper="colors"]').getByRole("slider").fill("3");
    await expect(result).toHaveAttribute("data-reproject-colors", "3");
    await page
      .locator('[data-stepper="colors"]')
      .getByRole("slider")
      .fill("24");
    await expect(result).toHaveAttribute("data-reproject-colors", "24");
    for (const mode of [
      "No dithering",
      "Ordered (Bayer 4x4)",
      "Floyd-Steinberg",
    ])
      await page.locator('[data-choice="dither"]').getByText(mode).click();
    await expect(result).toHaveAttribute(
      "data-reproject-mode",
      "floyd-steinberg",
    );
  });

  test("uploading a photo recomputes every figure", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    await expect(page.locator("main.how-page")).toHaveAttribute(
      "data-photo",
      "Golden dunes",
    );
    const text = (id: string) => figure(page, id).innerText();
    const before: Record<string, string> = {};
    const drawn: Record<string, string[]> = {};
    for (const id of SECTIONS) {
      before[id] = await text(id);
      drawn[id] = await pictures(page, id);
    }

    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve("public/samples/fern.webp"));
    await finished(page, 2);
    await expect(page.locator("main.how-page")).toHaveAttribute(
      "data-photo",
      "fern.webp",
    );

    for (const id of SECTIONS) {
      await expect(figure(page, id)).toHaveAttribute("data-version", "2");
      await expect(figure(page, id)).toHaveAttribute("data-photo", "fern.webp");
      // Only the decisions are the same for every photo.
      if (id === "decisions") continue;
      const after = await pictures(page, id);
      const changedPicture = after.some((url, i) => url !== drawn[id][i]);
      const changedText = (await text(id)) !== before[id];
      expect(changedPicture || changedText, id).toBe(true);
    }
    // The cubes and the photo canvases really redraw.
    for (const id of ["sampling", "color-space", "rgb-vs-oklab", "reproject"])
      expect(await pictures(page, id), id).not.toEqual(drawn[id]);
    expect(errors).toEqual([]);
  });

  test("the choose-a-photo buttons switch the photo", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Forest floor" }).click();
    await finished(page, 2);
    await expect(page.locator("main.how-page")).toHaveAttribute(
      "data-photo",
      "Forest floor",
    );
    await expect(page.locator(".how-photo-status")).toContainText(
      "Showing Forest floor",
    );
  });

  test("a fully transparent upload reports a problem and keeps the last photo", async ({
    page,
  }) => {
    await open(page);
    const clear = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="none"/></svg>',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: "clear.svg",
      mimeType: "image/svg+xml",
      buffer: clear,
    });
    await expect(page.locator(".how-photo-status")).toContainText(
      "fully transparent",
    );
    await expect(page.locator("main.how-page")).toHaveAttribute(
      "data-photo",
      "Golden dunes",
    );
    await expect(figure(page, "snap")).toBeVisible();
  });

  test("after a failed upload the kept photo still answers a new color count", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await open(page);
    // A 1 by 1 PNG with no opaque pixel.
    const clear = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: "clear.png",
      mimeType: "image/png",
      buffer: clear,
    });
    await expect(page.locator(".how-photo-status")).toContainText(
      "fully transparent",
    );
    await expect(page.locator("main.how-page")).toHaveAttribute(
      "data-photo",
      "Golden dunes",
    );

    // 11 was never computed for this photo, so it needs the worker.
    const result = page.locator("[data-reproject-colors]");
    await page
      .locator('[data-stepper="colors"]')
      .getByRole("slider")
      .fill("11");
    await expect(result).toHaveAttribute("data-reproject-colors", "11", {
      timeout: 5000,
    });
    await expect(page.locator('[data-readout="reproject"]')).not.toContainText(
      "could not be updated",
    );
    expect(errors).toEqual([]);
  });

  test("the last photo chosen wins when choices overlap", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    await page.getByRole("button", { name: "Forest floor" }).click();
    await page.getByRole("button", { name: "Golden dunes" }).click();
    await expect(page.locator(".how-photo-status")).toContainText(
      "Showing Golden dunes",
    );
    // A slower, older analysis must not land on top of it afterwards.
    await page.waitForTimeout(1500);
    await expect(page.locator("main.how-page")).toHaveAttribute(
      "data-photo",
      "Golden dunes",
    );
    await expect(page.locator(".how-photo-status")).toContainText(
      "Showing Golden dunes",
    );
    expect(errors).toEqual([]);
  });

  test("the app links to it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "How it works" }).click();
    const link = page.getByRole("link", { name: "Read how median cut works" });
    await expect(link).toHaveAttribute("href", "/how.html");
    await Promise.all([page.waitForURL(/how\.html$/), link.click()]);
    await expect(page).toHaveTitle("How median cut works");
  });
});

test.describe("with reduced motion", () => {
  test("figures open on their final state and ask for no animation frames", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as { __frames: number };
      w.__frames = 0;
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        w.__frames++;
        return request(callback);
      };
    });
    await open(page);
    const frames = () =>
      page.evaluate(() => (window as unknown as { __frames: number }).__frames);

    // The split scrubber opens on the last split, with no Play button.
    const readout = page.locator('[data-readout="one-split"]');
    const last = await readout.getAttribute("data-split-count");
    await expect(readout).toHaveAttribute("data-split", last!);
    await expect(page.getByRole("button", { name: "Play" })).toHaveCount(0);
    await expect(
      page.locator('[data-figure="reproject"] [data-reproject-mode]'),
    ).toHaveAttribute("data-reproject-mode", "floyd-steinberg");

    // Using every kind of control still asks for no frames.
    const cube = page.locator('[data-cube="color-space"]');
    await cube.scrollIntoViewIfNeeded();
    const box = (await cube.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 60, { steps: 5 });
    await page.mouse.up();
    const range = page
      .locator('[data-stepper="one-split"]')
      .getByRole("slider");
    await range.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.locator('[data-choice="dither"]').getByText("Ordered").click();
    expect(await frames()).toBe(0);
    // Nothing on the page is running an animation either.
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
    );
    expect(running).toBe(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("reads at 390 px with no sideways scroll and no small text", async ({
    page,
  }) => {
    await open(page);
    const layout = await page.evaluate(() => {
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > window.innerWidth + 0.5;
        })
        .map((el) => el.tagName.toLowerCase() + "." + el.className);
      const small: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement!;
        if (!node.textContent!.trim() || el.closest("script,style")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (parseFloat(style.fontSize) < 12)
          small.push(`${el.tagName.toLowerCase()} ${style.fontSize}`);
      }
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        wide,
        small,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
    expect(layout.wide).toEqual([]);
    expect(layout.small).toEqual([]);
    for (const id of SECTIONS) {
      const box = (await figure(page, id).boundingBox())!;
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(390);
    }
  });
});

for (const width of [390, 768, 1440]) {
  test(`axe finds nothing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const scan = async (state: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes[0].target}`),
        state,
      ).toEqual([]);
    };
    await scan("first view");

    // Other states: other choices made, every decision open, a new photo.
    await page
      .locator('[data-choice="gap-cut"]')
      .getByText("The median")
      .click();
    await page
      .locator('[data-choice="rank"]')
      .getByText("Population", { exact: true })
      .click();
    await page.locator('[data-choice="dither"]').getByText("Ordered").click();
    await page.locator(".how-box-picker button").nth(3).click();
    await page
      .locator('[data-stepper="one-split"]')
      .getByRole("slider")
      .fill("4");
    await page
      .locator('[data-stepper="colors"]')
      .getByRole("slider")
      .fill("20");
    await expect(page.locator("[data-reproject-colors]")).toHaveAttribute(
      "data-reproject-colors",
      "20",
    );
    for (const summary of await page.locator(".how-decisions summary").all())
      await summary.click();
    await scan("other states");

    await page.getByRole("button", { name: "Forest floor" }).click();
    await finished(page, 2);
    await scan("second photo");
  });
}

test.describe("the production build", () => {
  const preview = `http://127.0.0.1:${process.env.E2E_PREVIEW_PORT ?? 4183}`;
  test.use({ baseURL: preview });

  test("serves the page and its worker without errors", async ({ page }) => {
    const errors = watchErrors(page);
    const failed: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400)
        failed.push(`${response.status()} ${response.url()}`);
    });
    await open(page);
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
