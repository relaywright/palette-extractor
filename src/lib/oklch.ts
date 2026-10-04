import { srgbToOklab } from "@relaywright/median-cut";
import type { RGB } from "./color";

export interface Oklch {
  L: number;
  C: number;
  /** Hue in degrees, 0 to 360. Meaningless when C is near zero. */
  h: number;
}

export type Gamut = "srgb" | "p3";
type Triple = [number, number, number];

/** Just-noticeable difference the CSS Color 4 gamut mapping aims under. */
const JND = 0.02;
const EPSILON = 0.0001;
const IN_GAMUT_SLACK = 1e-6;

export function rgbToOklch(rgb: RGB): Oklch {
  const { L, a, b } = srgbToOklab(rgb);
  const C = Math.hypot(a, b);
  const h = C < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

function oklchToOklab({ L, C, h }: Oklch): Triple {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

/** Bjorn Ottosson's inverse matrices: OKLab to linear-light sRGB. */
function oklabToLinearSrgb([L, a, b]: Triple): Triple {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearSrgbToOklab([r, g, b]: Triple): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// Linear sRGB and linear Display P3 share a white point and transfer curve,
// so one 3x3 matrix (and its inverse) moves between them.
const SRGB_TO_P3: number[][] = [
  [0.8224621, 0.177538, 0],
  [0.0331941, 0.9668058, 0],
  [0.0170827, 0.0723974, 0.9105199],
];
const P3_TO_SRGB: number[][] = [
  [1.2249401, -0.2249404, 0],
  [-0.0420569, 1.0420571, 0],
  [-0.0196376, -0.0786361, 1.0982735],
];

function multiply(m: number[][], [x, y, z]: Triple): Triple {
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z,
    m[1][0] * x + m[1][1] * y + m[1][2] * z,
    m[2][0] * x + m[2][1] * y + m[2][2] * z,
  ];
}

/** Linear-light channels of an OKLab color, in the chosen RGB gamut. */
function toLinear(lab: Triple, gamut: Gamut): Triple {
  const srgb = oklabToLinearSrgb(lab);
  return gamut === "p3" ? multiply(SRGB_TO_P3, srgb) : srgb;
}

function labOfLinear(linear: Triple, gamut: Gamut): Triple {
  return linearSrgbToOklab(
    gamut === "p3" ? multiply(P3_TO_SRGB, linear) : linear,
  );
}

const inGamut = (linear: Triple) =>
  linear.every((c) => c >= -IN_GAMUT_SLACK && c <= 1 + IN_GAMUT_SLACK);

const clip = (linear: Triple): Triple =>
  linear.map((c) => Math.min(1, Math.max(0, c))) as Triple;

const deltaEOK = (x: Triple, y: Triple) =>
  Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);

/**
 * CSS Color 4 gamut mapping: binary search on chroma at constant lightness
 * and hue, stopping at the most chromatic color whose clipped version is
 * within the OKLab JND of it. Returns linear-light channels inside the gamut.
 */
export function mapToGamut(color: Oklch, gamut: Gamut): Triple {
  if (color.L >= 1) return [1, 1, 1];
  if (color.L <= 0) return [0, 0, 0];
  const at = (C: number) => oklchToOklab({ L: color.L, C, h: color.h });
  let current = at(color.C);
  let linear = toLinear(current, gamut);
  if (inGamut(linear)) return clip(linear);
  let clipped = clip(linear);
  if (deltaEOK(labOfLinear(clipped, gamut), current) < JND) return clipped;
  let min = 0;
  let max = color.C;
  let minInGamut = true;
  while (max - min > EPSILON) {
    const chroma = (min + max) / 2;
    current = at(chroma);
    linear = toLinear(current, gamut);
    if (minInGamut && inGamut(linear)) {
      min = chroma;
      continue;
    }
    clipped = clip(linear);
    const error = deltaEOK(labOfLinear(clipped, gamut), current);
    if (error < JND) {
      if (JND - error < EPSILON) return clipped;
      minInGamut = false;
      min = chroma;
    } else max = chroma;
  }
  return clipped;
}

const encode = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** Gamut-maps an OKLCH color into sRGB and rounds to 8 bits per channel. */
export function oklchToRgb(color: Oklch): RGB {
  const [r, g, b] = mapToGamut(color, "srgb").map((c) =>
    Math.round(Math.min(1, Math.max(0, encode(c))) * 255),
  );
  return { r, g, b };
}

/** Gamut-maps an OKLCH color into Display P3 as a CSS color() string. */
export function oklchToDisplayP3(color: Oklch): string {
  const channels = mapToGamut(color, "p3").map((c) =>
    String(Number(Math.min(1, Math.max(0, encode(c))).toFixed(4))),
  );
  return `color(display-p3 ${channels.join(" ")})`;
}
