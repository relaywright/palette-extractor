import { describe, expect, it } from "vitest";
import { CVD_MATRICES, CVD_TYPES, confusablePairs, simulateCvd } from "./cvd";

describe("CVD matrices", () => {
  // Machado, Oliveira and Fernandes (2009), Table 1, severity 1.0.
  it("match the published severity 1.0 values exactly", () => {
    expect(CVD_MATRICES.protanopia).toEqual([
      0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882,
      -0.048116, 1.051998,
    ]);
    expect(CVD_MATRICES.deuteranopia).toEqual([
      0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182,
      0.04294, 0.968881,
    ]);
    expect(CVD_MATRICES.tritanopia).toEqual([
      1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733,
      0.691367, 0.3039,
    ]);
  });

  it("keep neutral grays neutral (each row sums to about 1)", () => {
    for (const type of CVD_TYPES) {
      const m = CVD_MATRICES[type];
      for (let row = 0; row < 3; row++)
        expect(m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2]).toBeCloseTo(1, 3);
      const gray = simulateCvd({ r: 128, g: 128, b: 128 }, type);
      expect(Math.abs(gray.r - 128)).toBeLessThanOrEqual(1);
      expect(Math.abs(gray.g - 128)).toBeLessThanOrEqual(1);
      expect(Math.abs(gray.b - 128)).toBeLessThanOrEqual(1);
    }
  });
});

describe("simulateCvd", () => {
  it("collapses red and green toward each other without red-green vision", () => {
    const red = simulateCvd({ r: 200, g: 60, b: 40 }, "deuteranopia");
    const green = simulateCvd({ r: 120, g: 150, b: 40 }, "deuteranopia");
    expect(Math.abs(red.r - green.r)).toBeLessThan(60);
    expect(Math.abs(red.g - green.g)).toBeLessThan(60);
  });
});

describe("confusablePairs", () => {
  it("flags a red and a green that only differ by hue, sorted nearest first", () => {
    const palette = [
      { r: 180, g: 100, b: 60 },
      { r: 120, g: 140, b: 60 },
      { r: 20, g: 30, b: 120 },
    ];
    const pairs = confusablePairs(palette, "deuteranopia");
    expect(pairs.map((p) => [p.a, p.b])).toEqual([[0, 1]]);
  });

  it("returns nothing for clearly different colors", () => {
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
    expect(confusablePairs(palette, "protanopia")).toEqual([]);
  });
});
