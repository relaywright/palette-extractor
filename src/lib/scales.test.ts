import { describe, expect, it } from "vitest";
import { type RGB, rgbToHex } from "./color";
import { mapToGamut, rgbToOklch } from "./oklch";
import { STOPS, anchorIndex, shadeScale } from "./scales";

const hex = (value: string): RGB => ({
  r: parseInt(value.slice(1, 3), 16),
  g: parseInt(value.slice(3, 5), 16),
  b: parseInt(value.slice(5, 7), 16),
});

const SAMPLES = [
  "#000000",
  "#ffffff",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff00ff",
  "#00ffff",
  "#123456",
  "#d9a872",
  "#b97667",
  "#7c8890",
  "#d3c8b3",
  "#fdfdfc",
  "#050403",
  "#f5e6ff",
  "#01010a",
].map(hex);

describe("shadeScale", () => {
  it.each(SAMPLES.map((c) => [rgbToHex(c), c] as const))(
    "%s: lightness falls strictly from 50 to 950 and every hex is valid sRGB",
    (_, color) => {
      const scale = shadeScale(color);
      expect(scale.map((s) => s.stop)).toEqual([...STOPS]);
      for (const shade of scale) {
        for (const channel of [shade.rgb.r, shade.rgb.g, shade.rgb.b]) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
        expect(shade.hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(shade.hex).toBe(rgbToHex(shade.rgb));
        // The reported lightness is that of the emitted hex, not the target.
        expect(shade.lightness).toBeCloseTo(rgbToOklch(shade.rgb).L, 10);
        expect(shade.p3).toMatch(/^color\(display-p3 [\d. ]+\)$/);
      }
      for (let i = 1; i < scale.length; i++)
        expect(scale[i].lightness).toBeLessThan(scale[i - 1].lightness);
    },
  );

  it("keeps the swatch's own color at its natural stop", () => {
    for (const color of SAMPLES) {
      const scale = shadeScale(color);
      const anchors = scale.filter((s) => s.anchor);
      expect(anchors).toHaveLength(1);
      expect(anchors[0].hex).toBe(rgbToHex(color));
      expect(scale[anchorIndex(rgbToOklch(color).L)].anchor).toBe(true);
    }
  });

  it("puts mid-lightness colors near 500 and extremes at the ends", () => {
    expect(anchorIndex(0.64)).toBe(STOPS.indexOf(500));
    expect(anchorIndex(1)).toBe(0);
    expect(anchorIndex(0)).toBe(STOPS.length - 1);
  });

  it("is deterministic", () => {
    expect(shadeScale(hex("#b97667"))).toEqual(shadeScale(hex("#b97667")));
  });
});

describe("mapToGamut", () => {
  it("returns in-gamut colors unchanged and maps out-of-gamut ones into range", () => {
    const inside = mapToGamut({ L: 0.6, C: 0.05, h: 40 }, "srgb");
    expect(inside.every((c) => c >= 0 && c <= 1)).toBe(true);
    for (const gamut of ["srgb", "p3"] as const) {
      const mapped = mapToGamut({ L: 0.7, C: 0.4, h: 150 }, gamut);
      expect(mapped.every((c) => c >= 0 && c <= 1)).toBe(true);
    }
  });

  it("gives white and black at the lightness extremes", () => {
    expect(mapToGamut({ L: 1, C: 0.3, h: 20 }, "srgb")).toEqual([1, 1, 1]);
    expect(mapToGamut({ L: 0, C: 0.3, h: 20 }, "srgb")).toEqual([0, 0, 0]);
  });
});
