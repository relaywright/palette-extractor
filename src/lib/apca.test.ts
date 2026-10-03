import { describe, expect, it } from "vitest";
import { apcaContrast } from "./apca";
import type { RGB } from "./color";

const hex = (value: string): RGB => ({
  r: parseInt(value.slice(1, 3), 16),
  g: parseInt(value.slice(3, 5), 16),
  b: parseInt(value.slice(5, 7), 16),
});

describe("apcaContrast", () => {
  // Reference values from the APCA-W3 0.0.98G-4g reference implementation.
  const reference: [string, string, number][] = [
    ["#888888", "#ffffff", 63.06],
    ["#ffffff", "#888888", -68.54],
    ["#000000", "#aaaaaa", 58.15],
    ["#aaaaaa", "#000000", -56.24],
    ["#112233", "#ddeeff", 91.66],
    ["#ddeeff", "#112233", -93.07],
  ];
  it.each(reference)("%s on %s is Lc %s", (text, background, expected) => {
    expect(
      Math.abs(apcaContrast(hex(text), hex(background)) - expected),
    ).toBeLessThan(0.1);
  });

  it("is zero for identical colors and for pairs too close to read", () => {
    expect(apcaContrast(hex("#777777"), hex("#777777"))).toBe(0);
    expect(apcaContrast(hex("#777777"), hex("#7a7a7a"))).toBe(0);
  });

  it("is positive for dark on light and negative for light on dark", () => {
    expect(apcaContrast(hex("#222222"), hex("#eeeeee"))).toBeGreaterThan(0);
    expect(apcaContrast(hex("#eeeeee"), hex("#222222"))).toBeLessThan(0);
  });
});
