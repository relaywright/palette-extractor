import { oklabDistance } from "@relaywright/median-cut";
import type { RGB } from "./color";
import type { StageSamples } from "./extraction";
import { NO_SWATCH } from "./stageGroups";

/** Arrow keys move the pick cursor this many working pixels, or this many with Shift. */
export const KEY_STEP = 2;
export const KEY_STEP_BIG = 16;

/** The swatch each working pixel's sample belongs to, or -1 where no sample sits. */
export function ownerGrid(
  samples: Pick<StageSamples, "width" | "height" | "positions" | "groups">,
  swatchOfGroup: Uint8Array,
): Int16Array {
  const { width, height, positions, groups } = samples;
  const grid = new Int16Array(width * height).fill(-1);
  for (let i = 0; i < groups.length; i++) {
    const x = positions[2 * i],
      y = positions[2 * i + 1];
    const swatch = swatchOfGroup[groups[i]];
    if (x < width && y < height && swatch !== undefined && swatch !== NO_SWATCH)
      grid[y * width + x] = swatch;
  }
  return grid;
}

/**
 * The swatch that owns a pixel: the one its sample was grouped into, else
 * (for pixels outside the sample set) the palette color nearest in OKLab.
 */
export function swatchOwning(
  grid: Int16Array,
  index: number,
  color: RGB,
  swatches: RGB[],
): number {
  if (!swatches.length) return -1;
  if (grid[index] >= 0 && grid[index] < swatches.length) return grid[index];
  let best = 0,
    bestDistance = Infinity;
  swatches.forEach((swatch, i) => {
    const distance = oklabDistance(color, swatch);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

export interface Cover {
  /** Box pixels per pixel of the image as the page shows it. */
  scale: number;
  /** Box pixels per working pixel across and down. */
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * How `object-fit: cover` places the photo in a box, written in working
 * pixels. The working raster is the photo rounded down to at most 320 px, so
 * its proportions can differ from the photo's (a 1000 by 1 photo works out as
 * 320 by 1). The placement follows the photo's own size (`naturalWidth` by
 * `naturalHeight`, which default to the raster's) and the raster is stretched
 * over it, so every layer crops exactly as the photo does.
 */
export function coverFit(
  box: { width: number; height: number },
  width: number,
  height: number,
  naturalWidth = width,
  naturalHeight = height,
): Cover {
  const scale = Math.max(box.width / naturalWidth, box.height / naturalHeight);
  return {
    scale,
    scaleX: (scale * naturalWidth) / width,
    scaleY: (scale * naturalHeight) / height,
    offsetX: (box.width - naturalWidth * scale) / 2,
    offsetY: (box.height - naturalHeight * scale) / 2,
  };
}

/** The working pixel under a point in the box, or null outside the image. */
export function pixelAt(
  point: { x: number; y: number },
  cover: Cover,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const x = Math.floor((point.x - cover.offsetX) / cover.scaleX),
    y = Math.floor((point.y - cover.offsetY) / cover.scaleY);
  return x < 0 || y < 0 || x >= width || y >= height ? null : { x, y };
}

/** Where a working pixel's center sits in the box. */
export function pointOf(
  pixel: { x: number; y: number },
  cover: Cover,
): { x: number; y: number } {
  return {
    x: cover.offsetX + (pixel.x + 0.5) * cover.scaleX,
    y: cover.offsetY + (pixel.y + 0.5) * cover.scaleY,
  };
}

/** An inclusive range of working pixels. */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * The working pixels whose centers show inside the box. A crop narrower than
 * one working pixel keeps the pixel at its middle.
 */
export function visiblePixels(
  box: { width: number; height: number },
  cover: Cover,
  width: number,
  height: number,
): Bounds {
  const range = (
    extent: number,
    offset: number,
    scale: number,
    count: number,
  ): [number, number] => {
    const clamp = (value: number) => Math.min(count - 1, Math.max(0, value));
    const low = clamp(Math.ceil(-offset / scale - 0.5)),
      high = clamp(Math.floor((extent - offset) / scale - 0.5));
    if (low <= high) return [low, high];
    const middle = clamp(Math.floor((extent / 2 - offset) / scale));
    return [middle, middle];
  };
  const [minX, maxX] = range(box.width, cover.offsetX, cover.scaleX, width);
  const [minY, maxY] = range(box.height, cover.offsetY, cover.scaleY, height);
  return { minX, maxX, minY, maxY };
}

/** The part of the working raster the box shows, in working pixels. */
export function visibleCrop(
  box: { width: number; height: number },
  cover: Cover,
  width: number,
  height: number,
) {
  const sx = Math.max(0, -cover.offsetX / cover.scaleX),
    sy = Math.max(0, -cover.offsetY / cover.scaleY);
  return {
    sx,
    sy,
    sw: Math.min(width - sx, box.width / cover.scaleX),
    sh: Math.min(height - sy, box.height / cover.scaleY),
  };
}

export interface Placement {
  left: number;
  top: number;
}

/**
 * Where a loupe of `size` goes beside the point `at` in a box: above it,
 * else below, else to either side, whichever fits whole inside the box
 * without covering the point. In a box too small for any of those it takes
 * the roomiest edge, clamped inside.
 */
export function loupePlacement(
  at: { x: number; y: number },
  box: { width: number; height: number },
  size: { width: number; height: number },
  gap = 22,
  margin = 4,
): Placement {
  const across = (value: number) =>
    Math.max(margin, Math.min(value, box.width - size.width - margin));
  const down = (value: number) =>
    Math.max(margin, Math.min(value, box.height - size.height - margin));
  const above = at.y - gap - size.height,
    below = at.y + gap,
    right = at.x + gap,
    left = at.x - gap - size.width;
  const fitsY = (top: number) =>
    top >= margin && top + size.height <= box.height - margin;
  const fitsX = (side: number) =>
    side >= margin && side + size.width <= box.width - margin;
  if (fitsY(above)) return { left: across(at.x - size.width / 2), top: above };
  if (fitsY(below)) return { left: across(at.x - size.width / 2), top: below };
  const middle = down(at.y - size.height / 2);
  if (fitsX(right)) return { left: right, top: middle };
  if (fitsX(left)) return { left, top: middle };
  return {
    left: across(at.x - size.width / 2),
    top: down(at.y > box.height / 2 ? above : below),
  };
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** `pixel` moved inside `bounds`. */
export function clampPixel(
  pixel: { x: number; y: number },
  bounds: Bounds,
): { x: number; y: number } {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, pixel.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, pixel.y)),
  };
}

/**
 * The cursor after an arrow key, kept inside the image (or inside `bounds`,
 * the part of it that shows); null for other keys.
 */
export function moveCursor(
  pixel: { x: number; y: number },
  key: string,
  big: boolean,
  width: number,
  height: number,
  bounds: Bounds = { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 },
): { x: number; y: number } | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = big ? KEY_STEP_BIG : KEY_STEP;
  return clampPixel(
    { x: pixel.x + direction[0] * step, y: pixel.y + direction[1] * step },
    bounds,
  );
}
