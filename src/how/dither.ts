import type { Pixel } from "@relaywright/median-cut";

export type DitherMode = "none" | "ordered" | "floyd-steinberg";

/** Pixels more transparent than this stay out of the palette, as in the app. */
export const ALPHA_MIN = 125;

/** The standard 4x4 Bayer matrix: each cell is that position's rank, 0 to 15. */
export const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Where Floyd-Steinberg sends a pixel's rounding error, and how much. */
export const FLOYD_STEINBERG: readonly {
  dx: number;
  dy: number;
  weight: number;
}[] = [
  { dx: 1, dy: 0, weight: 7 / 16 },
  { dx: -1, dy: 1, weight: 3 / 16 },
  { dx: 0, dy: 1, weight: 5 / 16 },
  { dx: 1, dy: 1, weight: 1 / 16 },
];

/** Index of the palette color closest to (r, g, b) by RGB distance. */
export function nearestIndex(
  palette: readonly Pixel[],
  r: number,
  g: number,
  b: number,
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * How far ordered dithering may push a channel. A palette of n colors has
 * about the cube root of n steps along each channel, so the push shrinks as
 * the palette grows.
 */
export const orderedSpread = (colors: number) => 255 / Math.cbrt(colors);

const clamp = (value: number) => Math.min(255, Math.max(0, value));

/**
 * Redraws an image using only the palette's colors. `none` snaps each pixel
 * to its nearest color. `ordered` first nudges each pixel by its position's
 * Bayer threshold, so a flat area becomes a fixed pattern of two neighbors.
 * `floyd-steinberg` snaps in reading order and hands each pixel's error to
 * the pixels not yet visited. Pixels that are mostly transparent stay
 * transparent. The result is a new RGBA buffer.
 */
export function reproject(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: readonly Pixel[],
  mode: DitherMode,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  if (palette.length === 0) return out;
  const spread = orderedSpread(palette.length);
  // Error carried forward, per channel, for the diffusion mode.
  const carried =
    mode === "floyd-steinberg" ? new Float32Array(width * height * 3) : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const q = y * width + x;
      const i = q * 4;
      if (rgba[i + 3] < ALPHA_MIN) continue;
      let r = rgba[i],
        g = rgba[i + 1],
        b = rgba[i + 2];
      if (mode === "ordered") {
        const offset = (0.5 - (BAYER_4X4[y & 3][x & 3] + 0.5) / 16) * spread;
        r = clamp(r + offset);
        g = clamp(g + offset);
        b = clamp(b + offset);
      } else if (carried) {
        r = clamp(r + carried[q * 3]);
        g = clamp(g + carried[q * 3 + 1]);
        b = clamp(b + carried[q * 3 + 2]);
      }
      const [pr, pg, pb] = palette[nearestIndex(palette, r, g, b)];
      out[i] = pr;
      out[i + 1] = pg;
      out[i + 2] = pb;
      out[i + 3] = 255;
      if (!carried) continue;
      const error = [r - pr, g - pg, b - pb];
      for (const { dx, dy, weight } of FLOYD_STEINBERG) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const target = ny * width + nx;
        for (let k = 0; k < 3; k++)
          carried[target * 3 + k] += error[k] * weight;
      }
    }
  }
  return out;
}
