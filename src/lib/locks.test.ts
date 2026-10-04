import { describe, expect, it } from "vitest";
import type { RGB } from "./color";
import { locksFor, newPinId, toggleLocked } from "./locks";

const red: RGB = { r: 238, g: 85, b: 51 };
const blue: RGB = { r: 51, g: 102, b: 153 };

describe("toggleLocked", () => {
  it("pins a swatch that is not pinned, under its own id", () => {
    expect(toggleLocked([{ id: "b", color: blue }], "a", red)).toEqual([
      { id: "b", color: blue },
      { id: "a", color: red },
    ]);
  });
  it("unpins a pinned swatch", () => {
    const locks = [
      { id: "a", color: red },
      { id: "b", color: blue },
    ];
    expect(toggleLocked(locks, "a", red)).toEqual([{ id: "b", color: blue }]);
  });
  it("unpins the swatch that was clicked when its color is repeated", () => {
    // A share link can repeat a color, and each copy is its own swatch.
    const locks = [
      { id: "a", color: red },
      { id: "b", color: { ...red } },
      { id: "c", color: blue },
    ];
    expect(toggleLocked(locks, "a", red).map((l) => l.id)).toEqual(["b", "c"]);
    expect(toggleLocked(locks, "b", red).map((l) => l.id)).toEqual(["a", "c"]);
  });
});

describe("locksFor", () => {
  it("gives each color its own id, repeated colors included", () => {
    const locks = locksFor([red, { ...red }, blue]);
    expect(locks.map((l) => l.color)).toEqual([red, red, blue]);
    expect(new Set(locks.map((l) => l.id)).size).toBe(3);
  });
});

describe("newPinId", () => {
  it("never repeats", () => {
    expect(newPinId()).not.toBe(newPinId());
  });
});
