import type { RGB } from "../lib/color";

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** Lightness 0-1, chroma 0-~0.4, hue in degrees 0-360. */
export interface Oklch {
  L: number;
  C: number;
  h: number;
}

// The conversions use Bjorn Ottosson's published OKLab matrices; the GLSL in
// gl.ts repeats them, so a change here needs the same change there.

const toLinearTable = Float64Array.from({ length: 256 }, (_, value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

export function srgbToOklab({ r, g, b }: RGB): Oklab {
  const rl = toLinearTable[r];
  const gl = toLinearTable[g];
  const bl = toLinearTable[b];
  const l = Math.cbrt(
    0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl,
  );
  const m = Math.cbrt(
    0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl,
  );
  const s = Math.cbrt(
    0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl,
  );
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Linear-light sRGB, which can fall outside 0-1 for colors outside the gamut. */
export function oklabToLinear(L: number, a: number, b: number) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

// The published matrices are only inverses to about 1e-5, so a color on the
// gamut's edge can land that far outside it. Under half a byte once encoded,
// and the shader uses the same tolerance.
export const GAMUT_SLACK = 1e-4;

function inGamut({ r, g, b }: { r: number; g: number; b: number }) {
  const low = -GAMUT_SLACK;
  const high = 1 + GAMUT_SLACK;
  return (
    r >= low && r <= high && g >= low && g <= high && b >= low && b <= high
  );
}

function encode(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

// Enough halvings that the chroma is within 1/4096 of the gamut edge, which
// no 8-bit channel can show. The shader runs the same count.
export const GAMUT_STEPS = 12;

/**
 * OKLab to sRGB bytes. A color outside the gamut keeps its lightness and
 * hue and loses chroma toward the gray axis until it fits, which holds its
 * perceived brightness better than clipping each channel would. Every
 * channel of the result is an integer from 0 to 255.
 */
export function oklabToSrgb(L: number, a: number, b: number): RGB {
  const lightness = Math.min(1, Math.max(0, L));
  let linear = oklabToLinear(lightness, a, b);
  if (!inGamut(linear)) {
    let low = 0;
    let high = 1;
    for (let step = 0; step < GAMUT_STEPS; step++) {
      const mid = (low + high) / 2;
      if (inGamut(oklabToLinear(lightness, a * mid, b * mid))) low = mid;
      else high = mid;
    }
    linear = oklabToLinear(lightness, a * low, b * low);
  }
  return { r: encode(linear.r), g: encode(linear.g), b: encode(linear.b) };
}

export function rgbToOklch(rgb: RGB): Oklch {
  const { L, a, b } = srgbToOklab(rgb);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { L, C: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

export function oklchToRgb({ L, C, h }: Oklch): RGB {
  const radians = (h * Math.PI) / 180;
  return oklabToSrgb(L, C * Math.cos(radians), C * Math.sin(radians));
}
