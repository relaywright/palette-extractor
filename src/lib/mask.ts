import type { StageSamples } from "./extraction";

/** How much of the photo a dimmed area still lets through, from 0 to 1. */
export const SCRIM_ALPHA = 0.72;

/**
 * One pixel of the working image for every sample whose group is lit: 1
 * there, 0 elsewhere. Each sample comes from its own pixel, so the number
 * of set pixels is exactly the lit groups' share of the samples.
 */
export function hardMask(
  samples: Pick<StageSamples, "width" | "height" | "positions" | "groups">,
  lit: ArrayLike<number>,
): Uint8Array {
  const { width, height, positions, groups } = samples;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < groups.length; i++) {
    if (!lit[groups[i]]) continue;
    const x = positions[2 * i],
      y = positions[2 * i + 1];
    if (x < width && y < height) mask[y * width + x] = 1;
  }
  return mask;
}

export const maskPopulation = (mask: Uint8Array) =>
  mask.reduce((sum, value) => sum + value, 0);

/** Number of samples in the lit groups, counted straight from the groups. */
export function litSamples(groups: Uint8Array, lit: ArrayLike<number>) {
  let count = 0;
  for (const group of groups) if (lit[group]) count++;
  return count;
}

/** Summed-area table, one row and column larger than the grid. */
function table(values: Uint8Array, width: number, height: number) {
  const stride = width + 1;
  const sums = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += values[y * width + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  return sums;
}

const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/**
 * How strongly each working pixel belongs to the lit groups, 0 to 255: of
 * the samples within `radius` pixels, the share that is lit. The samples
 * are sparse (at most 20,000 of the image's pixels), so a hard mask would
 * speckle; the share reads as a soft region and the browser's smoothing
 * softens it further when it is scaled up over the photo.
 */
export function softMask(
  samples: Pick<StageSamples, "width" | "height" | "positions" | "groups">,
  lit: ArrayLike<number>,
  radius: number,
): Uint8ClampedArray {
  const { width, height, positions, groups } = samples;
  const every = new Uint8Array(width * height);
  const some = new Uint8Array(width * height);
  for (let i = 0; i < groups.length; i++) {
    const x = positions[2 * i],
      y = positions[2 * i + 1];
    if (x >= width || y >= height) continue;
    every[y * width + x] = 1;
    if (lit[groups[i]]) some[y * width + x] = 1;
  }
  const all = table(every, width, height),
    own = table(some, width, height),
    stride = width + 1;
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius),
      bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius),
        right = Math.min(width, x + radius + 1);
      const area = (sums: Int32Array) =>
        sums[bottom * stride + right] -
        sums[top * stride + right] -
        sums[bottom * stride + left] +
        sums[top * stride + left];
      const total = area(all);
      if (total)
        out[y * width + x] = 255 * smoothstep(0.1, 0.9, area(own) / total);
    }
  }
  return out;
}

/** Radius that reaches about two samples' spacing, so gaps close up. */
export function maskRadius(
  samples: Pick<StageSamples, "width" | "height" | "groups">,
) {
  const spacing = Math.sqrt(
    (samples.width * samples.height) / Math.max(1, samples.groups.length),
  );
  return Math.max(1, Math.round(spacing * 1.5));
}

/** Black over everything the lit groups do not cover, as RGBA pixels. */
export function scrimPixels(soft: Uint8ClampedArray, scrim = SCRIM_ALPHA) {
  const pixels = new Uint8ClampedArray(soft.length * 4);
  for (let i = 0; i < soft.length; i++)
    pixels[4 * i + 3] = Math.round(255 * scrim * (1 - soft[i] / 255));
  return pixels;
}
