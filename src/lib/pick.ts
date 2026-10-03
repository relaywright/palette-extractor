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
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** How a width by height image is placed by `object-fit: cover` in a box. */
export function coverFit(
  box: { width: number; height: number },
  width: number,
  height: number,
): Cover {
  const scale = Math.max(box.width / width, box.height / height);
  return {
    scale,
    offsetX: (box.width - width * scale) / 2,
    offsetY: (box.height - height * scale) / 2,
  };
}

/** The working pixel under a point in the box, or null outside the image. */
export function pixelAt(
  point: { x: number; y: number },
  cover: Cover,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const x = Math.floor((point.x - cover.offsetX) / cover.scale),
    y = Math.floor((point.y - cover.offsetY) / cover.scale);
  return x < 0 || y < 0 || x >= width || y >= height ? null : { x, y };
}

/** Where a working pixel's center sits in the box. */
export function pointOf(
  pixel: { x: number; y: number },
  cover: Cover,
): { x: number; y: number } {
  return {
    x: cover.offsetX + (pixel.x + 0.5) * cover.scale,
    y: cover.offsetY + (pixel.y + 0.5) * cover.scale,
  };
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The cursor after an arrow key, kept inside the image; null for other keys. */
export function moveCursor(
  pixel: { x: number; y: number },
  key: string,
  big: boolean,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = big ? KEY_STEP_BIG : KEY_STEP;
  return {
    x: Math.min(width - 1, Math.max(0, pixel.x + direction[0] * step)),
    y: Math.min(height - 1, Math.max(0, pixel.y + direction[1] * step)),
  };
}
