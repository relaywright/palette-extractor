import { describe, expect, it } from "vitest";
import { oklabToSrgb, oklchToRgb, rgbToOklch, srgbToOklab } from "./oklab";

const edges = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 1, g: 2, b: 3 },
  { r: 254, g: 253, b: 252 },
];

describe("OKLab conversions", () => {
  it("round-trips every gray and the edge colors back to the same bytes", () => {
    const colors = [
      ...edges,
      ...Array.from({ length: 256 }, (_, v) => ({ r: v, g: v, b: v })),
    ];
    for (const color of colors) {
      const { L, a, b } = srgbToOklab(color);
      expect(oklabToSrgb(L, a, b)).toEqual(color);
    }
  });

  it("round-trips through OKLCH", () => {
    for (const color of edges)
      expect(oklchToRgb(rgbToOklch(color))).toEqual(color);
  });
});

describe("gamut mapping", () => {
  it("never emits a channel outside 0-255 or a fraction", () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 5000; i++) {
      const out = oklabToSrgb(next() * 2 - 0.5, next() * 2 - 1, next() * 2 - 1);
      for (const channel of [out.r, out.g, out.b]) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("keeps lightness and hue of an out-of-gamut color while losing chroma", () => {
    const wanted = { L: 0.6, C: 0.6, h: 140 };
    const out = rgbToOklch(oklchToRgb(wanted));
    expect(out.C).toBeLessThan(wanted.C);
    expect(Math.abs(out.L - wanted.L)).toBeLessThan(0.02);
    expect(Math.abs(out.h - wanted.h)).toBeLessThan(3);
  });

  it("maps lightness beyond the ends to black and white", () => {
    expect(oklabToSrgb(-0.2, 0.1, 0.1)).toEqual({ r: 0, g: 0, b: 0 });
    expect(oklabToSrgb(1.4, 0.1, 0.1)).toEqual({ r: 255, g: 255, b: 255 });
  });
});
