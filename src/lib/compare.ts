import { oklabDistance } from "@relaywright/median-cut";
import type { RGB } from "./color";

/**
 * Switching spaces often nudges a swatch to a neighboring pixel of the same
 * color. Below this OKLab distance two swatches read as the same color, so
 * only visible differences are counted and marked.
 */
export const SAME_COLOR_DISTANCE = 0.03;

/** One column of the comparison: the same color in each space, or one side only. */
export interface Column {
  rgb: RGB | null;
  oklab: RGB | null;
}

/**
 * Lines the two palettes up so matching colors share a column. Each color
 * pairs with its closest unpaired partner within SAME_COLOR_DISTANCE. RGB
 * order sets the columns; colors only Perceptual found follow at the end.
 */
export function alignPalettes(rgb: RGB[], oklab: RGB[]): Column[] {
  const pairs: { r: number; o: number; distance: number }[] = [];
  rgb.forEach((a, r) =>
    oklab.forEach((b, o) => {
      const distance = oklabDistance(a, b);
      if (distance < SAME_COLOR_DISTANCE) pairs.push({ r, o, distance });
    }),
  );
  pairs.sort((a, b) => a.distance - b.distance || a.r - b.r || a.o - b.o);
  const partner = new Map<number, number>();
  const taken = new Set<number>();
  for (const { r, o } of pairs) {
    if (partner.has(r) || taken.has(o)) continue;
    partner.set(r, o);
    taken.add(o);
  }
  return [
    ...rgb.map((color, r) => ({
      rgb: color,
      oklab: partner.has(r) ? oklab[partner.get(r)!] : null,
    })),
    ...oklab
      .filter((_, o) => !taken.has(o))
      .map((color) => ({ rgb: null, oklab: color })),
  ];
}

/** Columns where only one space has a color. */
export const changedColumns = (columns: Column[]) =>
  columns.filter((column) => !column.rgb || !column.oklab).length;
