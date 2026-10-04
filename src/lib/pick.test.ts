import { describe, expect, it } from "vitest";
import {
  coverFit,
  KEY_STEP,
  KEY_STEP_BIG,
  loupePlacement,
  moveCursor,
  ownerGrid,
  pixelAt,
  pointOf,
  swatchOwning,
  visibleCrop,
  visiblePixels,
} from "./pick";
import { NO_SWATCH } from "./stageGroups";

const swatches = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 0, b: 255 },
];

describe("ownerGrid", () => {
  it("marks each sample's pixel with its swatch", () => {
    const samples = {
      width: 3,
      height: 1,
      positions: new Uint16Array([0, 0, 2, 0, 1, 0]),
      groups: new Uint8Array([0, 1, 2]),
    };
    const grid = ownerGrid(samples, Uint8Array.from([1, 0, NO_SWATCH]));
    expect(Array.from(grid)).toEqual([1, -1, 0]);
  });
});

describe("swatchOwning", () => {
  const grid = Int16Array.from([1, -1]);

  it("uses the sample's swatch when the pixel was sampled", () => {
    expect(swatchOwning(grid, 0, { r: 250, g: 0, b: 0 }, swatches)).toBe(1);
  });

  it("falls back to the nearest palette color in OKLab", () => {
    expect(swatchOwning(grid, 1, { r: 10, g: 10, b: 240 }, swatches)).toBe(1);
    expect(swatchOwning(grid, 1, { r: 240, g: 20, b: 20 }, swatches)).toBe(0);
  });

  it("has no owner without a palette", () => {
    expect(swatchOwning(grid, 1, { r: 0, g: 0, b: 0 }, [])).toBe(-1);
  });
});

describe("cover mapping", () => {
  it("maps a point through object-fit cover and back", () => {
    // A 320 by 200 image in a 400 by 400 box is scaled to 640 by 400 and
    // cropped 120 px on each side.
    const cover = coverFit({ width: 400, height: 400 }, 320, 200);
    expect(cover.scale).toBe(2);
    expect(cover.offsetX).toBe(-120);
    expect(pixelAt({ x: 120, y: 0 }, cover, 320, 200)).toEqual({
      x: 120,
      y: 0,
    });
    expect(pixelAt({ x: 399, y: 399 }, cover, 320, 200)).toEqual({
      x: 259,
      y: 199,
    });
    expect(pointOf({ x: 120, y: 0 }, cover)).toEqual({ x: 121, y: 1 });
  });

  it("reports points outside the image as null", () => {
    const cover = coverFit({ width: 100, height: 100 }, 50, 20);
    expect(
      pixelAt({ x: 5, y: 5 }, { ...cover, offsetY: 20 }, 50, 20),
    ).toBeNull();
  });
});

describe("moveCursor", () => {
  it("steps and takes bigger steps with Shift", () => {
    expect(moveCursor({ x: 50, y: 50 }, "ArrowRight", false, 100, 100)).toEqual(
      {
        x: 50 + KEY_STEP,
        y: 50,
      },
    );
    expect(moveCursor({ x: 50, y: 50 }, "ArrowUp", true, 100, 100)).toEqual({
      x: 50,
      y: 50 - KEY_STEP_BIG,
    });
  });

  it("stays inside the image and ignores other keys", () => {
    expect(moveCursor({ x: 0, y: 99 }, "ArrowLeft", true, 100, 100)).toEqual({
      x: 0,
      y: 99,
    });
    expect(moveCursor({ x: 0, y: 99 }, "ArrowDown", true, 100, 100)).toEqual({
      x: 0,
      y: 99,
    });
    expect(moveCursor({ x: 1, y: 1 }, "a", false, 100, 100)).toBeNull();
  });
});

describe("placement by the photo's own proportions", () => {
  // A 1000 by 1 photo works out as a 320 by 1 raster, so the raster's own
  // proportions would crop it differently from the photo.
  const box = { width: 1400, height: 327 };

  it("crops a thin photo the way the page does", () => {
    const cover = coverFit(box, 320, 1, 1000, 1);
    expect(pixelAt({ x: 0, y: 100 }, cover, 320, 1)).toEqual({ x: 159, y: 0 });
    expect(pixelAt({ x: 1399, y: 100 }, cover, 320, 1)).toEqual({
      x: 160,
      y: 0,
    });
    const raster = coverFit(box, 320, 1);
    expect(pixelAt({ x: 0, y: 100 }, raster, 320, 1)).toEqual({ x: 157, y: 0 });
  });

  it("puts a pixel's center where the photo shows it", () => {
    const cover = coverFit({ width: 600, height: 300 }, 100, 50, 1000, 500);
    // The photo is exactly the box's proportions: 6 box pixels per working one.
    expect(pointOf({ x: 10, y: 20 }, cover)).toEqual({ x: 63, y: 123 });
    expect(pixelAt({ x: 63, y: 123 }, cover, 100, 50)).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("matches the raster's placement when the proportions agree", () => {
    const same = coverFit({ width: 400, height: 400 }, 320, 200, 640, 400);
    const plain = coverFit({ width: 400, height: 400 }, 320, 200);
    expect(same.scaleX).toBeCloseTo(plain.scaleX, 9);
    expect(same.offsetX).toBeCloseTo(plain.offsetX, 9);
    expect(same.scaleY).toBeCloseTo(plain.scaleY, 9);
  });

  it("names the crop of the raster the box shows", () => {
    const cover = coverFit({ width: 400, height: 400 }, 320, 200);
    const crop = visibleCrop({ width: 400, height: 400 }, cover, 320, 200);
    expect(crop).toEqual({ sx: 60, sy: 0, sw: 200, sh: 200 });
  });
});

describe("visiblePixels", () => {
  it("leaves out the pixels the crop hides", () => {
    // Scaled to 640 by 400 in a 400 by 400 box: 120 px cropped each side.
    const cover = coverFit({ width: 400, height: 400 }, 320, 200);
    expect(visiblePixels({ width: 400, height: 400 }, cover, 320, 200)).toEqual(
      { minX: 60, maxX: 259, minY: 0, maxY: 199 },
    );
  });

  it("keeps the middle pixel of a crop narrower than one pixel", () => {
    const box = { width: 640, height: 327 };
    const cover = coverFit(box, 320, 1, 1000, 1);
    const { minX, maxX } = visiblePixels(box, cover, 320, 1);
    expect(minX).toBe(maxX);
    expect(minX).toBeGreaterThanOrEqual(159);
    expect(maxX).toBeLessThanOrEqual(160);
  });

  it("holds the keyboard cursor inside it", () => {
    const bounds = { minX: 60, maxX: 259, minY: 0, maxY: 199 };
    expect(
      moveCursor({ x: 62, y: 5 }, "ArrowLeft", true, 320, 200, bounds),
    ).toEqual({ x: 60, y: 5 });
    expect(
      moveCursor({ x: 255, y: 5 }, "ArrowRight", true, 320, 200, bounds),
    ).toEqual({ x: 259, y: 5 });
  });
});

describe("loupePlacement", () => {
  const size = { width: 88, height: 111 };

  it("goes above the point when there is room", () => {
    const box = { width: 600, height: 400 };
    const place = loupePlacement({ x: 300, y: 300 }, box, size);
    expect(place.top + size.height).toBeLessThan(300);
    expect(place.left).toBe(300 - size.width / 2);
  });

  it("stays whole inside a short frame and off the point", () => {
    // The phone's source frame: 220 px tall, with no room above or below
    // the vertical middle.
    const box = { width: 358, height: 220 };
    for (let x = 0; x <= box.width; x += 11)
      for (let y = 0; y <= box.height; y += 11) {
        const { left, top } = loupePlacement({ x, y }, box, size);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left + size.width).toBeLessThanOrEqual(box.width);
        expect(top + size.height).toBeLessThanOrEqual(box.height);
        const covers =
          x >= left - 8 &&
          x <= left + size.width + 8 &&
          y >= top - 8 &&
          y <= top + size.height + 8;
        expect(covers, `point ${x},${y}`).toBe(false);
      }
  });
});
