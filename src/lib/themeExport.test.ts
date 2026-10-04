import { describe, expect, it } from "vitest";
import { exportTheme, themeVariables } from "./themeExport";

const theme = {
  surface: { r: 250, g: 244, b: 232 },
  text: { r: 30, g: 28, b: 26 },
  accent: { r: 200, g: 80, b: 50 },
};

describe("theme export", () => {
  it("names the set and its inverse", () => {
    expect(themeVariables(theme)).toEqual([
      ["surface", "#faf4e8"],
      ["text", "#1e1c1a"],
      ["accent", "#c85032"],
      ["surface-inverse", "#1e1c1a"],
      ["text-inverse", "#faf4e8"],
      ["accent-inverse", "#c85032"],
    ]);
  });

  it("writes CSS custom properties with valid hex values", () => {
    const css = exportTheme(theme, "css");
    expect(css).toMatch(/^\/\* .+ \*\/\n:root \{\n/);
    const declarations = [...css.matchAll(/^ {2}(--[a-z-]+): (.+);$/gm)];
    expect(declarations.map((m) => m[1])).toEqual([
      "--surface",
      "--text",
      "--accent",
      "--surface-inverse",
      "--text-inverse",
      "--accent-inverse",
    ]);
    for (const m of declarations) expect(m[2]).toMatch(/^#[0-9a-f]{6}$/);
    expect(css.trimEnd().endsWith("}")).toBe(true);
  });

  it("wraps Tailwind variables in @theme with color- names", () => {
    const tailwind = exportTheme(theme, "tailwind");
    expect(tailwind).toContain("@theme {");
    expect(tailwind).toContain("  --color-surface: #faf4e8;");
    expect(tailwind).toContain("  --color-accent-inverse: #c85032;");
    expect(tailwind).not.toContain(":root");
  });

  it("writes JSON that parses back to the same names", () => {
    const parsed = JSON.parse(exportTheme(theme, "json"));
    expect(parsed).toEqual(Object.fromEntries(themeVariables(theme)));
  });
});
