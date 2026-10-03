import { describe, expect, it } from "vitest";
import { alignPalettes, changedColumns } from "./compare";

const red = { r: 220, g: 30, b: 30 };
const nearRed = { r: 222, g: 31, b: 29 };
const green = { r: 30, g: 180, b: 60 };
const blue = { r: 30, g: 60, b: 200 };
const gold = { r: 230, g: 190, b: 40 };

describe("alignPalettes", () => {
  it("puts matching colors in the same column", () => {
    const columns = alignPalettes([red, green], [green, nearRed]);
    expect(columns).toEqual([
      { rgb: red, oklab: nearRed },
      { rgb: green, oklab: green },
    ]);
    expect(changedColumns(columns)).toBe(0);
  });

  it("marks colors found by one space only, Perceptual ones last", () => {
    const columns = alignPalettes([red, blue], [red, gold]);
    expect(columns).toEqual([
      { rgb: red, oklab: red },
      { rgb: blue, oklab: null },
      { rgb: null, oklab: gold },
    ]);
    expect(changedColumns(columns)).toBe(2);
  });

  it("pairs each color once", () => {
    const columns = alignPalettes([red, nearRed], [red]);
    expect(columns.filter((column) => column.oklab)).toHaveLength(1);
    expect(changedColumns(columns)).toBe(1);
  });

  it("handles empty palettes", () => {
    expect(alignPalettes([], [])).toEqual([]);
  });
});
