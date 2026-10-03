import {
  type RGB,
  rgbToHex,
  rgbToHsl,
  formatRgb,
  formatHsl,
  labelColorFor,
} from "./color";
import { paletteColorNames } from "./names";
import type { Shade } from "./scales";

export type ExportFormat = "css" | "tailwind" | "scss" | "svg" | "json";

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  css: "CSS variables",
  tailwind: "Tailwind",
  scss: "SCSS",
  svg: "SVG",
  json: "JSON",
};

/** Formats that can carry the 50 to 950 scales; SVG is a swatch strip. */
export const SHADE_FORMATS: ExportFormat[] = [
  "css",
  "tailwind",
  "scss",
  "json",
];

export interface ExportOptions {
  /** One 50 to 950 scale per palette color, from `shadeScale`. */
  shades?: Shade[][];
}

/** One line per stop of every scale, named `<n>-<stop>` after its color. */
function shadeLines(
  shades: Shade[][],
  line: (name: string, value: string) => string,
): string[] {
  return shades.flatMap((scale, i) =>
    scale.map((shade) => line(`${i + 1}-${shade.stop}`, shade.hex)),
  );
}

/** The palette lines, then a blank line and the scales when there are any. */
function withShades(lines: string[], shades: string[]): string[] {
  return shades.length ? [...lines, "", ...shades] : lines;
}

export function toCssVariables(
  palette: RGB[],
  { shades = [] }: ExportOptions = {},
): string {
  const lines = palette.map(
    (color, i) => `  --palette-${i + 1}: ${rgbToHex(color)};`,
  );
  const scales = shadeLines(
    shades,
    (name, value) => `  --palette-${name}: ${value};`,
  );
  return `:root {\n${withShades(lines, scales).join("\n")}\n}`;
}

/** Tailwind v4 @theme block; drop it into the main CSS file. */
export function toTailwind(
  palette: RGB[],
  { shades = [] }: ExportOptions = {},
): string {
  const lines = palette.map(
    (color, i) => `  --color-palette-${i + 1}: ${rgbToHex(color)};`,
  );
  const scales = shadeLines(
    shades,
    (name, value) => `  --color-palette-${name}: ${value};`,
  );
  return `@theme {\n${withShades(lines, scales).join("\n")}\n}`;
}

export function toJson(palette: RGB[], { shades }: ExportOptions = {}): string {
  const names = paletteColorNames(palette);
  const entries = palette.map((color, index) => ({
    name: names[index],
    hex: rgbToHex(color),
    rgb: formatRgb(color),
    hsl: formatHsl(rgbToHsl(color)),
    ...(shades?.[index] && {
      shades: Object.fromEntries(
        shades[index].map((shade) => [shade.stop, shade.hex]),
      ),
    }),
  }));
  return JSON.stringify(entries, null, 2);
}

export function toScss(
  palette: RGB[],
  { shades = [] }: ExportOptions = {},
): string {
  const lines = palette.map(
    (color, index) => `$palette-${index + 1}: ${rgbToHex(color)};`,
  );
  const scales = shadeLines(
    shades,
    (name, value) => `$palette-${name}: ${value};`,
  );
  return withShades(lines, scales).join("\n");
}

export function toSvg(palette: RGB[]): string {
  const swatchWidth = 120;
  const width = palette.length * swatchWidth;
  const swatches = palette
    .map((color, index) => {
      const hex = rgbToHex(color);
      const x = index * swatchWidth;
      const label = labelColorFor(color);
      return [
        `  <rect x="${x}" y="0" width="${swatchWidth}" height="120" fill="${hex}"/>`,
        `  <text x="${x + swatchWidth / 2}" y="66" text-anchor="middle" dominant-baseline="middle" fill="${label}" font-family="monospace" font-size="14">${hex}</text>`,
      ].join("\n");
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="120" viewBox="0 0 ${width} 120">\n${swatches}\n</svg>`;
}

export function exportPalette(
  palette: RGB[],
  format: ExportFormat,
  options: ExportOptions = {},
): string {
  switch (format) {
    case "css":
      return toCssVariables(palette, options);
    case "tailwind":
      return toTailwind(palette, options);
    case "scss":
      return toScss(palette, options);
    case "svg":
      return toSvg(palette);
    case "json":
      return toJson(palette, options);
  }
}
