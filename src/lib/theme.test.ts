import { describe, expect, it } from "vitest";
import { resolveRoles, suggestRoles } from "./theme";
import { contrastRatio } from "./contrast";

describe("palette role suggestions", () => {
  it("selects the strongest contrast pair and uses only source colors", () => {
    const dark = { r: 0, g: 0, b: 0 },
      light = { r: 255, g: 255, b: 255 },
      accent = { r: 230, g: 80, b: 40 };
    const roles = suggestRoles([accent, dark, light])!;
    expect(roles.background).toEqual(light);
    expect(roles.foreground).toEqual(dark);
    expect(roles.accent).toEqual(accent);
    expect(roles.ratio).toBe(21);
  });
  it("keeps the accent apart from the surface and the type", () => {
    // The most saturated color is also the lightest, so it wins the surface.
    const rose = { r: 230, g: 150, b: 160 },
      ink = { r: 20, g: 20, b: 30 },
      denim = { r: 70, g: 110, b: 150 };
    const roles = suggestRoles([rose, ink, denim])!;
    expect(roles.background).toEqual(rose);
    expect(roles.accent).toEqual(denim);
  });
  it("skips an accent too close to the surface to stand out", () => {
    const sand = { r: 236, g: 200, b: 160 },
      ink = { r: 24, g: 22, b: 20 },
      peach = { r: 240, g: 190, b: 140 },
      teal = { r: 40, g: 130, b: 130 };
    const roles = suggestRoles([sand, ink, peach, teal])!;
    expect(roles.background).toEqual(sand);
    expect(roles.accent).toEqual(teal);
  });
  it("keeps a vivid accent that differs from the surface in hue", () => {
    // Amber is about as light as the seafoam surface, but plainly different.
    const seafoam = { r: 132, g: 175, b: 189 },
      espresso = { r: 53, g: 33, b: 20 },
      amber = { r: 210, g: 113, b: 8 },
      rust = { r: 151, g: 81, b: 18 };
    const roles = suggestRoles([seafoam, espresso, amber, rust])!;
    expect(roles.background).toEqual(seafoam);
    expect(roles.accent).toEqual(amber);
  });
  it("falls back to a surface color when the palette has only two", () => {
    const dark = { r: 10, g: 10, b: 10 },
      red = { r: 220, g: 40, b: 40 };
    expect(suggestRoles([dark, red])!.accent).toEqual(red);
  });
  it("treats a repeated surface color as the surface", () => {
    // Share links can repeat a color, decoded as separate objects.
    const white = { r: 255, g: 255, b: 255 },
      red = { r: 150, g: 0, b: 0 };
    expect(suggestRoles([white, red, { ...white }])!.accent).toEqual(red);
  });
  it("does not fabricate contrast for monochrome palettes", () => {
    const gray = { r: 120, g: 120, b: 120 };
    expect(suggestRoles([gray])?.ratio).toBe(1);
    expect(suggestRoles([gray])?.background).toEqual(gray);
  });
  it("handles empty and low-contrast palettes without claiming a pass", () => {
    expect(suggestRoles([])).toBeNull();
    expect(
      suggestRoles([
        { r: 120, g: 120, b: 120 },
        { r: 125, g: 125, b: 125 },
      ])!.ratio,
    ).toBeLessThan(4.5);
  });
});

describe("resolveRoles", () => {
  const dark = { r: 0, g: 0, b: 0 },
    light = { r: 255, g: 255, b: 255 },
    accent = { r: 230, g: 80, b: 40 },
    mid = { r: 120, g: 120, b: 120 };
  const palette = [accent, dark, light, mid];

  it("matches the suggestion when nothing is picked", () => {
    const roles = resolveRoles(palette, {})!;
    expect(roles.surface).toEqual(light);
    expect(roles.text).toEqual(dark);
    expect(roles.accent).toEqual(accent);
    expect(roles.indices).toEqual({ surface: 2, text: 1, accent: 0 });
    expect(roles.changed).toBe(false);
  });
  it("applies a pick and recomputes contrast from it", () => {
    const roles = resolveRoles(palette, { text: 3 })!;
    expect(roles.text).toEqual(mid);
    expect(roles.textRatio).toBeCloseTo(contrastRatio(mid, light), 5);
    expect(roles.textRatio).toBeLessThan(roles.bestRatio);
    expect(roles.changed).toBe(true);
  });
  it("ignores a pick the palette no longer has", () => {
    const roles = resolveRoles(palette, { accent: 9, surface: -1 })!;
    expect(roles.indices).toEqual({ surface: 2, text: 1, accent: 0 });
    expect(roles.changed).toBe(false);
  });
  it("does not count a pick of an identical color as a change", () => {
    const twin = [...palette, { ...light }];
    expect(resolveRoles(twin, { surface: 4 })!.changed).toBe(false);
  });
  it("has nothing to resolve for an empty palette", () => {
    expect(resolveRoles([], {})).toBeNull();
  });
});
