import { srgbToOklab } from "@relaywright/median-cut";
import type { RGB } from "./color";

export type CvdType = "protanopia" | "deuteranopia" | "tritanopia";

type Matrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

// Severity 1.0 matrices from Machado, Oliveira and Fernandes, "A
// Physiologically-based Model for Simulation of Color Vision Deficiency",
// IEEE TVCG 15(6), 2009, Table 1. Row-major, applied to linear-light RGB.
export const CVD_MATRICES: Record<CvdType, Matrix> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882,
    -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182,
    0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733,
    0.691367, 0.3039,
  ],
};

export const CVD_TYPES = Object.keys(CVD_MATRICES) as CvdType[];

/** Colors closer than this in OKLab are hard to tell apart. */
export const CONFUSABLE_DISTANCE = 0.04;

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toByte = (linear: number) => {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round(
    (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255,
  );
};

/** How a color looks to someone with the given deficiency (full severity). */
export function simulateCvd(rgb: RGB, type: CvdType): RGB {
  const m = CVD_MATRICES[type];
  const [r, g, b] = [toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b)];
  return {
    r: toByte(m[0] * r + m[1] * g + m[2] * b),
    g: toByte(m[3] * r + m[4] * g + m[5] * b),
    b: toByte(m[6] * r + m[7] * g + m[8] * b),
  };
}

export interface ConfusablePair {
  /** Indexes into the palette, a < b. */
  a: number;
  b: number;
  distance: number;
}

/** Palette pairs that fall within the OKLab threshold under a simulation. */
export function confusablePairs(
  palette: RGB[],
  type: CvdType,
  threshold = CONFUSABLE_DISTANCE,
): ConfusablePair[] {
  const labs = palette.map((color) => srgbToOklab(simulateCvd(color, type)));
  const pairs: ConfusablePair[] = [];
  for (let a = 0; a < labs.length; a++) {
    for (let b = a + 1; b < labs.length; b++) {
      const distance = Math.hypot(
        labs[a].L - labs[b].L,
        labs[a].a - labs[b].a,
        labs[a].b - labs[b].b,
      );
      if (distance < threshold) pairs.push({ a, b, distance });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}
