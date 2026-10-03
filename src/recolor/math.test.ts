import { describe, expect, it } from "vitest";
import type { RGB } from "../lib/color";
import { buildModel, recolorColor, recolorPixels } from "./math";
import { oklchToRgb, rgbToOklch } from "./oklab";

const palette: RGB[] = [
  { r: 20, g: 24, b: 60 },
  { r: 210, g: 80, b: 90 },
  { r: 240, g: 200, b: 120 },
  { r: 60, g: 140, b: 110 },
];

// Edge colors first, then a seeded scatter of everything else.
function testImage(): Uint8ClampedArray {
  const pixels: number[] = [];
  for (const [r, g, b] of [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [0, 255, 255],
    [255, 0, 255],
    [255, 255, 0],
    [128, 128, 128],
  ])
    pixels.push(r, g, b, 255);
  let seed = 11;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return Math.floor((seed / 4294967296) * 256);
  };
  for (let i = 0; i < 4000; i++) pixels.push(next(), next(), next(), next());
  return Uint8ClampedArray.from(pixels);
}

describe("recolor with no edits", () => {
  it("builds no model when the edited palette equals the extracted one", () => {
    expect(
      buildModel(
        palette,
        palette.map((c) => ({ ...c })),
      ),
    ).toBeNull();
  });

  it("returns every pixel byte for byte, edge colors included", () => {
    const image = testImage();
    const out = recolorPixels(image, buildModel(palette, palette));
    expect(Array.from(out)).toEqual(Array.from(image));
    expect(out).not.toBe(image);
  });
});

describe("recolor with an edit", () => {
  const edited = palette.map((c, i) =>
    i === 1 ? oklchToRgb({ ...rgbToOklch(c), h: rgbToOklch(c).h + 90 }) : c,
  );
  const model = buildModel(palette, edited)!;

  it("moves a pixel sitting on the edited color onto the edited color", () => {
    const moved = recolorColor(model, palette[1]);
    expect(Math.abs(moved.r - edited[1].r)).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.g - edited[1].g)).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.b - edited[1].b)).toBeLessThanOrEqual(1);
  });

  it("leaves a pixel sitting on an untouched color where it was", () => {
    for (const i of [0, 2, 3]) {
      const kept = recolorColor(model, palette[i]);
      expect(Math.abs(kept.r - palette[i].r)).toBeLessThanOrEqual(1);
      expect(Math.abs(kept.g - palette[i].g)).toBeLessThanOrEqual(1);
      expect(Math.abs(kept.b - palette[i].b)).toBeLessThanOrEqual(1);
    }
  });

  it("also moves a pixel that sits between the edited color and a neighbor", () => {
    const between = {
      r: Math.round((palette[1].r + palette[2].r) / 2),
      g: Math.round((palette[1].g + palette[2].g) / 2),
      b: Math.round((palette[1].b + palette[2].b) / 2),
    };
    const moved = recolorColor(model, between);
    expect(moved).not.toEqual(between);
  });

  it("keeps alpha and emits whole-number channels in range for every pixel", () => {
    const image = testImage();
    const out = recolorPixels(image, model);
    expect(out.length).toBe(image.length);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i + 3]).toBe(image[i + 3]);
      for (const channel of [out[i], out[i + 1], out[i + 2]]) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("survives a palette of one color and an edit far out of gamut", () => {
    const single = buildModel(
      [{ r: 10, g: 200, b: 30 }],
      [oklchToRgb({ L: 0.5, C: 0.4, h: 300 })],
    )!;
    const out = recolorPixels(testImage(), single);
    expect(out.every((v) => v >= 0 && v <= 255)).toBe(true);
  });
});
