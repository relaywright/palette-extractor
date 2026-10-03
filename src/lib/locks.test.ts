import { describe, expect, it } from "vitest";
import type { RGB } from "./color";
import { toggleLocked } from "./locks";

const red: RGB = { r: 238, g: 85, b: 51 };
const blue: RGB = { r: 51, g: 102, b: 153 };

describe("toggleLocked", () => {
  it("pins a color that is not pinned", () => {
    expect(toggleLocked([blue], red)).toEqual([blue, red]);
  });
  it("unpins a pinned color", () => {
    expect(toggleLocked([red, blue], { ...red })).toEqual([blue]);
  });
  it("unpins one copy of a repeated color and keeps the other", () => {
    // A share link can repeat a color, and each copy is its own swatch.
    expect(toggleLocked([red, { ...red }, blue], red)).toEqual([
      { ...red },
      blue,
    ]);
  });
});
