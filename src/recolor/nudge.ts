import type { RGB } from "../lib/color";
import type { PaletteEdit } from "../hooks/usePaletteEdits";
import { oklchToRgb, rgbToOklch, type Oklch } from "./oklab";

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export const MAX_CHROMA = 0.4;

/** One keyboard nudge, in lightness, chroma and hue steps. */
export interface EditStep {
  l?: number;
  c?: number;
  h?: number;
}

const STEPS: Record<string, EditStep> = {
  ArrowUp: { l: 0.02 },
  ArrowDown: { l: -0.02 },
  ArrowRight: { h: 5 },
  ArrowLeft: { h: -5 },
  PageUp: { c: 0.01 },
  PageDown: { c: -0.01 },
};

/** The step an edit key takes; null for Home, which undoes the color. */
export const stepForKey = (key: string): EditStep | null => STEPS[key] ?? null;

/** An edit from OKLCH coordinates, with the sRGB color they make. */
export function makeEdit({ L, C, h }: Oklch): PaletteEdit {
  return { L, C, h, color: oklchToRgb({ L, C, h }) };
}

/** The swatch's OKLCH: its stored edit, or its extracted color's. */
export function valueOf(original: RGB, edit: PaletteEdit | null): Oklch {
  return edit ?? rgbToOklch(original);
}

/** The edit after one keyboard step, kept inside the range the controls offer. */
export function nudgeEdit(
  original: RGB,
  edit: PaletteEdit | null,
  step: EditStep,
): PaletteEdit {
  const value = valueOf(original, edit);
  return makeEdit({
    L: clamp(value.L + (step.l ?? 0), 0, 1),
    C: clamp(value.C + (step.c ?? 0), 0, MAX_CHROMA),
    h: (((value.h + (step.h ?? 0)) % 360) + 360) % 360,
  });
}
