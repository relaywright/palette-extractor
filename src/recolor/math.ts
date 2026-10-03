import { type RGB, rgbToHex } from "../lib/color";
import { type Oklab, oklabToSrgb, srgbToOklab } from "./oklab";

/** The palette never has more colors than this; the shader's arrays match. */
export const MAX_COLORS = 10;

// A pixel's reach into the palette is a Gaussian whose width is this share
// of the mean spacing between palette colors. Wider reaches drag pixels near
// an untouched color along with a neighbor's edit.
const SIGMA_SCALE = 0.5;
const MIN_SIGMA = 0.02;

export interface RecolorModel {
  /** The extracted palette, in OKLab. */
  origins: Oklab[];
  /**
   * Per palette color, the shift that makes a pixel sitting exactly on a
   * palette color move by exactly that swatch's edit, once the neighbors'
   * pull is counted in. Equal to the edits when the colors are far apart.
   */
  shifts: Oklab[];
  /** 1 / (2 sigma squared), as the weights use it. */
  sharpness: number;
}

function meanSpacing(colors: Oklab[]): number {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++) {
      total += Math.hypot(
        colors[i].L - colors[j].L,
        colors[i].a - colors[j].a,
        colors[i].b - colors[j].b,
      );
      pairs++;
    }
  return pairs ? total / pairs : 1;
}

/**
 * Prepares a recolor from the extracted palette and its edited twin (same
 * order). Returns null when no swatch changed, which is the signal to leave
 * the photo exactly as it is.
 */
export function buildModel(
  original: RGB[],
  edited: RGB[],
): RecolorModel | null {
  const count = Math.min(original.length, edited.length, MAX_COLORS);
  const origins: Oklab[] = [];
  const shifts: Oklab[] = [];
  let changed = false;
  for (let i = 0; i < count; i++) {
    const from = srgbToOklab(original[i]);
    origins.push(from);
    if (rgbToHex(original[i]) === rgbToHex(edited[i])) {
      shifts.push({ L: 0, a: 0, b: 0 });
      continue;
    }
    changed = true;
    const to = srgbToOklab(edited[i]);
    shifts.push({ L: to.L - from.L, a: to.a - from.a, b: to.b - from.b });
  }
  if (!changed) return null;
  const sigma = Math.max(MIN_SIGMA, meanSpacing(origins) * SIGMA_SCALE);
  const sharpness = 1 / (2 * sigma * sigma);
  return {
    origins,
    shifts: interpolate(origins, shifts, sharpness),
    sharpness,
  };
}

// Normalized Gaussian weights of one color to every palette color.
function weightsAt(origins: Oklab[], sharpness: number, color: Oklab) {
  const distances = origins.map(
    (o) => (color.L - o.L) ** 2 + (color.a - o.a) ** 2 + (color.b - o.b) ** 2,
  );
  const nearest = Math.min(...distances);
  const raw = distances.map((d) => Math.exp(-(d - nearest) * sharpness));
  const total = raw.reduce((sum, w) => sum + w, 0);
  return raw.map((w) => w / total);
}

/**
 * Solves for the shifts that carry each palette color exactly onto its
 * edited color (Gaussian elimination on the palette's own weight matrix, a
 * handful of rows). Falls back to the plain edits if the system is not
 * solvable, which only happens for palette colors that sit on each other.
 */
function interpolate(
  origins: Oklab[],
  wanted: Oklab[],
  sharpness: number,
): Oklab[] {
  const n = origins.length;
  const rows = origins.map((origin, i) => [
    ...weightsAt(origins, sharpness, origin),
    wanted[i].L,
    wanted[i].a,
    wanted[i].b,
  ]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let r = column + 1; r < n; r++)
      if (Math.abs(rows[r][column]) > Math.abs(rows[pivot][column])) pivot = r;
    if (Math.abs(rows[pivot][column]) < 1e-9) return wanted;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let r = 0; r < n; r++) {
      if (r === column) continue;
      const factor = rows[r][column] / rows[column][column];
      for (let c = column; c < n + 3; c++)
        rows[r][c] -= factor * rows[column][c];
    }
  }
  const solved = rows.map((row, i) => ({
    L: row[n] / row[i],
    a: row[n + 1] / row[i],
    b: row[n + 2] / row[i],
  }));
  return solved.every((s) => [s.L, s.a, s.b].every(Number.isFinite))
    ? solved
    : wanted;
}

/**
 * The OKLab shift for one pixel: its Gaussian weights to the palette colors,
 * normalized to sum to 1, applied to the swatch edits. Weights are measured
 * from the nearest palette color, so they never underflow for a pixel far
 * from every color.
 */
export function shiftAt(model: RecolorModel, color: Oklab): Oklab {
  const { origins, shifts, sharpness } = model;
  const distances = new Float64Array(origins.length);
  let nearest = Infinity;
  for (let i = 0; i < origins.length; i++) {
    const o = origins[i];
    distances[i] =
      (color.L - o.L) ** 2 + (color.a - o.a) ** 2 + (color.b - o.b) ** 2;
    if (distances[i] < nearest) nearest = distances[i];
  }
  let total = 0;
  let L = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < origins.length; i++) {
    const weight = Math.exp(-(distances[i] - nearest) * sharpness);
    total += weight;
    L += weight * shifts[i].L;
    a += weight * shifts[i].a;
    b += weight * shifts[i].b;
  }
  return { L: L / total, a: a / total, b: b / total };
}

/** One sRGB pixel through the recolor. */
export function recolorColor(model: RecolorModel | null, rgb: RGB): RGB {
  if (!model) return rgb;
  const lab = srgbToOklab(rgb);
  const shift = shiftAt(model, lab);
  // A pixel that no edit reaches keeps its bytes rather than taking a trip
  // through OKLab and back.
  if (shift.L === 0 && shift.a === 0 && shift.b === 0) return rgb;
  return oklabToSrgb(lab.L + shift.L, lab.a + shift.a, lab.b + shift.b);
}

/**
 * Recolors RGBA bytes into a new array. With no model the result is a byte
 * for byte copy. Alpha is never touched.
 */
export function recolorPixels(
  source: Uint8ClampedArray,
  model: RecolorModel | null,
): Uint8ClampedArray<ArrayBuffer> {
  const out = source.slice();
  if (!model) return out;
  for (let i = 0; i < out.length; i += 4) {
    const next = recolorColor(model, {
      r: source[i],
      g: source[i + 1],
      b: source[i + 2],
    });
    out[i] = next.r;
    out[i + 1] = next.g;
    out[i + 2] = next.b;
  }
  return out;
}
