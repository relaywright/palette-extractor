import { type RGB, rgbToHex } from "./color";

export type ThemeFormat = "css" | "tailwind" | "json";

export interface Theme {
  surface: RGB;
  text: RGB;
  accent: RGB;
}

/**
 * The variables of a theme, in order. The inverse set is for the opposite
 * light or dark mode: surface and text trade colors. The accent keeps its
 * color, because it was picked to stand apart from both surface colors.
 */
export function themeVariables(theme: Theme): [name: string, hex: string][] {
  const hex = {
    surface: rgbToHex(theme.surface),
    text: rgbToHex(theme.text),
    accent: rgbToHex(theme.accent),
  };
  return [
    ["surface", hex.surface],
    ["text", hex.text],
    ["accent", hex.accent],
    ["surface-inverse", hex.text],
    ["text-inverse", hex.surface],
    ["accent-inverse", hex.accent],
  ];
}

const NOTE =
  "The inverse set swaps surface and text for the opposite mode; the accent stays.";

export function exportTheme(theme: Theme, format: ThemeFormat): string {
  const vars = themeVariables(theme);
  if (format === "json")
    return JSON.stringify(Object.fromEntries(vars), null, 2);
  const lines = (prefix: string) =>
    vars.map(([name, hex]) => `  --${prefix}${name}: ${hex};`).join("\n");
  if (format === "tailwind")
    return `/* ${NOTE} */\n@theme {\n${lines("color-")}\n}`;
  return `/* ${NOTE} */\n:root {\n${lines("")}\n}`;
}
