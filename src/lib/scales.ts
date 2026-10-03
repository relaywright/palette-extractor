import { type RGB, rgbToHex } from "./color";
import { type Oklch, oklchToDisplayP3, oklchToRgb, rgbToOklch } from "./oklch";

export const STOPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
export type Stop = (typeof STOPS)[number];

/**
 * OKLCH lightness each stop aims for. The steps are widest in the midtones
 * and tighten at both ends, which keeps 50/100 and 900/950 distinguishable.
 * A swatch takes the stop nearest its own lightness (its anchor) and keeps
 * its exact color there; the other stops hold the swatch's chroma and hue at
 * these lightnesses, gamut-mapped into sRGB.
 */
export const STOP_LIGHTNESS: Record<Stop, number> = {
  50: 0.98,
  100: 0.95,
  200: 0.9,
  300: 0.83,
  400: 0.74,
  500: 0.64,
  600: 0.55,
  700: 0.46,
  800: 0.37,
  900: 0.29,
  950: 0.22,
};

/** Smallest lightness gap between neighboring stops once rounded to hex. */
const MIN_STEP = 0.004;

export interface Shade {
  stop: Stop;
  rgb: RGB;
  hex: string;
  /** The same stop mapped into Display P3, as a CSS color() value. */
  p3: string;
  /** OKLCH lightness of the emitted color, 0 to 1. */
  lightness: number;
  /** True for the stop that holds the swatch's own color. */
  anchor: boolean;
}

export function anchorIndex(lightness: number): number {
  let best = 0;
  STOPS.forEach((stop, i) => {
    if (
      Math.abs(STOP_LIGHTNESS[stop] - lightness) <
      Math.abs(STOP_LIGHTNESS[STOPS[best]] - lightness)
    )
      best = i;
  });
  return best;
}

/**
 * The 50 to 950 scale for one color. Lightness falls strictly from stop to
 * stop in the emitted hex values: a stop that gamut mapping or rounding would
 * leave too close to its neighbor is pushed further out.
 */
export function shadeScale(color: RGB): Shade[] {
  const base = rgbToOklch(color);
  const anchor = anchorIndex(base.L);
  const shades: Shade[] = new Array(STOPS.length);

  const make = (index: number, lightness: number): Shade => {
    const target: Oklch = { ...base, L: lightness };
    const rgb = oklchToRgb(target);
    return {
      stop: STOPS[index],
      rgb,
      hex: rgbToHex(rgb),
      p3: oklchToDisplayP3(target),
      lightness: rgbToOklch(rgb).L,
      anchor: false,
    };
  };

  shades[anchor] = {
    stop: STOPS[anchor],
    rgb: color,
    hex: rgbToHex(color),
    p3: oklchToDisplayP3(base),
    lightness: base.L,
    anchor: true,
  };

  // Darker stops, walking away from the anchor. Retries stop at pure black.
  for (let i = anchor + 1; i < STOPS.length; i++) {
    const previous = shades[i - 1].lightness;
    let target = Math.min(STOP_LIGHTNESS[STOPS[i]], previous - MIN_STEP * 2);
    let shade = make(i, Math.max(0, target));
    for (
      let tries = 0;
      shade.lightness > previous - MIN_STEP && tries < 20;
      tries++
    ) {
      target -= MIN_STEP;
      shade = make(i, Math.max(0, target));
    }
    shades[i] = shade;
  }

  // Lighter stops, walking the other way. Retries stop at pure white.
  for (let i = anchor - 1; i >= 0; i--) {
    const next = shades[i + 1].lightness;
    let target = Math.max(STOP_LIGHTNESS[STOPS[i]], next + MIN_STEP * 2);
    let shade = make(i, Math.min(1, target));
    for (
      let tries = 0;
      shade.lightness < next + MIN_STEP && tries < 20;
      tries++
    ) {
      target += MIN_STEP;
      shade = make(i, Math.min(1, target));
    }
    shades[i] = shade;
  }

  return shades;
}
