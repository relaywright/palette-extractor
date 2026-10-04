import { describe, expect, it } from "vitest";
import type { Pixel } from "@relaywright/median-cut";
import { BAYER_4X4, FLOYD_STEINBERG, nearestIndex, reproject } from "./dither";

const PALETTE: Pixel[] = [
  [10, 20, 30],
  [200, 40, 40],
  [240, 230, 60],
  [30, 160, 90],
  [250, 250, 250],
];

/** A small deterministic image with every channel varying. */
function image(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let q = 0; q < width * height; q++) {
    rgba[q * 4] = (q * 37) % 256;
    rgba[q * 4 + 1] = (q * 91 + 13) % 256;
    rgba[q * 4 + 2] = (q * 53 + 101) % 256;
    rgba[q * 4 + 3] = 255;
  }
  return rgba;
}

const colorsIn = (rgba: Uint8ClampedArray) => {
  const found = new Set<string>();
  for (let i = 0; i < rgba.length; i += 4)
    found.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  return found;
};

describe("reproject without dithering", () => {
  it("maps every pixel to its nearest palette color", () => {
    const rgba = image(24, 16);
    const out = reproject(rgba, 24, 16, PALETTE, "none");
    for (let q = 0; q < 24 * 16; q++) {
      const [r, g, b] =
        PALETTE[
          nearestIndex(PALETTE, rgba[q * 4], rgba[q * 4 + 1], rgba[q * 4 + 2])
        ];
      expect([out[q * 4], out[q * 4 + 1], out[q * 4 + 2]]).toEqual([r, g, b]);
      expect(out[q * 4 + 3]).toBe(255);
    }
  });

  it("brute-force checks the nearest color, not just the helper", () => {
    const rgba = Uint8ClampedArray.from([120, 90, 70, 255]);
    const out = reproject(rgba, 1, 1, PALETTE, "none");
    const distances = PALETTE.map(
      ([r, g, b]) => (r - 120) ** 2 + (g - 90) ** 2 + (b - 70) ** 2,
    );
    const nearest = PALETTE[distances.indexOf(Math.min(...distances))];
    expect([out[0], out[1], out[2]]).toEqual(nearest);
  });

  it("leaves mostly transparent pixels transparent", () => {
    const rgba = Uint8ClampedArray.from([200, 40, 40, 20, 200, 40, 40, 255]);
    const out = reproject(rgba, 2, 1, PALETTE, "none");
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(255);
  });
});

describe("ordered dithering", () => {
  it("uses the standard 4x4 Bayer matrix", () => {
    expect(BAYER_4X4).toEqual([
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ]);
  });

  it("turns a mid gray into the matrix's own pattern", () => {
    const blackWhite: Pixel[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const gray = new Uint8ClampedArray(8 * 8 * 4);
    for (let q = 0; q < 64; q++) gray.set([128, 128, 128, 255], q * 4);
    const out = reproject(gray, 8, 8, blackWhite, "ordered");
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        // Half the thresholds sit under 128/255, so the cells ranked 0 to 7
        // turn white and the rest stay black.
        const white = BAYER_4X4[y % 4][x % 4] < 8;
        expect(out[(y * 8 + x) * 4]).toBe(white ? 255 : 0);
      }
  });

  it("outputs only palette colors", () => {
    const out = reproject(image(24, 16), 24, 16, PALETTE, "ordered");
    const allowed = new Set(PALETTE.map((p) => p.join(",")));
    for (const color of colorsIn(out)) expect(allowed.has(color)).toBe(true);
  });
});

describe("Floyd-Steinberg dithering", () => {
  it("hands out exactly the whole error", () => {
    const total = FLOYD_STEINBERG.reduce((sum, { weight }) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("only sends error to pixels not yet visited", () => {
    for (const { dx, dy } of FLOYD_STEINBERG)
      expect(dy > 0 || (dy === 0 && dx > 0)).toBe(true);
  });

  it("outputs only palette colors", () => {
    const out = reproject(image(24, 16), 24, 16, PALETTE, "floyd-steinberg");
    const allowed = new Set(PALETTE.map((p) => p.join(",")));
    for (const color of colorsIn(out)) expect(allowed.has(color)).toBe(true);
  });

  it("keeps the average brightness of a flat area", () => {
    const blackWhite: Pixel[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const gray = new Uint8ClampedArray(32 * 32 * 4);
    for (let q = 0; q < 32 * 32; q++) gray.set([64, 64, 64, 255], q * 4);
    const out = reproject(gray, 32, 32, blackWhite, "floyd-steinberg");
    let sum = 0;
    for (let q = 0; q < 32 * 32; q++) sum += out[q * 4];
    expect(sum / (32 * 32)).toBeGreaterThan(55);
    expect(sum / (32 * 32)).toBeLessThan(73);
  });
});
