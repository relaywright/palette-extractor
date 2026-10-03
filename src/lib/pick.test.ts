import { describe, expect, it } from "vitest";
import {
  coverFit,
  KEY_STEP,
  KEY_STEP_BIG,
  moveCursor,
  ownerGrid,
  pixelAt,
  pointOf,
  swatchOwning,
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
