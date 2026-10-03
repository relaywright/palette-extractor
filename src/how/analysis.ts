import {
  medianCutTrace,
  medianCutWeighted,
  oklabCoords,
  type ColorSpace,
  type Pixel,
  type SplitStep,
  type WeightedColor,
} from "@relaywright/median-cut";
import { STAGE_SAMPLE_LIMIT, type StageSamples } from "../lib/extraction";
import { ALPHA_MIN } from "./dither";

/** The longest edge of the working image, as in the app. */
export const MAX_DIMENSION = 320;

/** Colors the figures extract from the photo. */
export const PALETTE_SIZE = 8;

const TRANSPARENT =
  "That image is fully transparent. Choose an image with visible pixels.";

/** The working image's size for a photo, longest edge capped at 320. */
export function workingSize(
  width: number,
  height: number,
  longest = MAX_DIMENSION,
) {
  const scale = Math.min(1, longest / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** One median-cut run over the photo's pixels, in one color space. */
export interface SpaceAnalysis {
  space: ColorSpace;
  steps: SplitStep[];
  colors: WeightedColor[];
  /** Every pixel in the run's 0-255 coordinates: pixel i is coords[3i..3i+2]. */
  coords: Uint8Array;
  /** The box holding pixel i at step k: boxes[k * pixelCount + i]. */
  boxes: Uint16Array;
  /** Samples for the stage renderer. */
  samples: StageSamples;
}

export interface Analysis {
  width: number;
  height: number;
  /** Colors asked for; a flat image can return fewer. */
  count: number;
  /** Opaque pixels, which are the ones the quantizer sees. */
  pixelCount: number;
  /** The opaque pixels' colors: pixel i is pixels[3i..3i+2]. */
  pixels: Uint8Array;
  rgb: SpaceAnalysis;
  oklab: SpaceAnalysis;
}

/** The opaque pixels of an RGBA buffer, as the quantizer takes them. */
export function opaquePixels(rgba: Uint8ClampedArray) {
  const raster: number[] = [];
  const tuples: Pixel[] = [];
  for (let q = 0; q * 4 < rgba.length; q++) {
    const i = q * 4;
    if (rgba[i + 3] < ALPHA_MIN) continue;
    raster.push(q);
    tuples.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  return { raster, tuples };
}

function runSpace(
  tuples: Pixel[],
  raster: number[],
  width: number,
  height: number,
  count: number,
  space: ColorSpace,
): SpaceAnalysis {
  const n = tuples.length;
  const { steps, result, assignments } = medianCutTrace(tuples, count, {
    colorSpace: space,
    assignments: true,
  });
  const coords = new Uint8Array(n * 3);
  const min: Pixel = [255, 255, 255];
  const max: Pixel = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const c = space === "oklab" ? oklabCoords(tuples[i]) : tuples[i];
    for (let k = 0; k < 3; k++) {
      coords[i * 3 + k] = c[k];
      if (c[k] < min[k]) min[k] = c[k];
      if (c[k] > max[k]) max[k] = c[k];
    }
  }

  const m = Math.min(n, STAGE_SAMPLE_LIMIT);
  const stepCount = steps.length;
  const positions = new Uint16Array(m * 2);
  const colors = new Uint8Array(m * 3);
  const groups = new Uint8Array(m);
  const boxes = new Uint8Array(stepCount * m);
  for (let j = 0; j < m; j++) {
    const i = Math.floor((j * n) / m);
    const q = raster[i];
    positions[2 * j] = q % width;
    positions[2 * j + 1] = Math.floor(q / width);
    colors.set(tuples[i], 3 * j);
    groups[j] = assignments!.groups[i];
    for (let k = 0; k < stepCount; k++)
      boxes[k * m + j] = assignments!.boxes[k * n + i];
  }
  const samples: StageSamples = {
    width,
    height,
    positions,
    colors,
    groups,
    boxes,
    groupColors: result.map((entry) => entry.color),
    // Sampling can skip a rare color the split boxes still reach.
    ...(m < n && { extent: { min, max } }),
  };
  return {
    space,
    steps,
    colors: result,
    coords,
    boxes: assignments!.boxes,
    samples,
  };
}

/**
 * Runs the quantizer on a working image in both color spaces and keeps what
 * the figures draw from: every split, which box held each pixel at each
 * step, and a sample of the pixels for the 3D view.
 */
export function analyze(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  count = PALETTE_SIZE,
): Analysis {
  const { raster, tuples } = opaquePixels(rgba);
  return analyzePixels(tuples, raster, width, height, count);
}

/** `analyze` for pixels already filtered by `opaquePixels`. */
export function analyzePixels(
  tuples: Pixel[],
  raster: number[],
  width: number,
  height: number,
  count = PALETTE_SIZE,
): Analysis {
  if (!tuples.length) throw new Error(TRANSPARENT);
  const pixels = new Uint8Array(tuples.length * 3);
  tuples.forEach((p, i) => pixels.set(p, i * 3));
  return {
    width,
    height,
    count,
    pixelCount: tuples.length,
    pixels,
    rgb: runSpace(tuples, raster, width, height, count, "rgb"),
    oklab: runSpace(tuples, raster, width, height, count, "oklab"),
  };
}

/** A palette of `count` colors for a working image, most populous first. */
export function paletteFor(
  rgba: Uint8ClampedArray,
  count: number,
): WeightedColor[] {
  return medianCutWeighted(opaquePixels(rgba).tuples, count);
}

/** The buffers an analysis owns, to hand over instead of copying. */
export function analysisBuffers(analysis: Analysis): ArrayBuffer[] {
  const buffers = [analysis.pixels.buffer];
  for (const run of [analysis.rgb, analysis.oklab]) {
    const { samples } = run;
    buffers.push(
      run.coords.buffer,
      run.boxes.buffer,
      samples.positions.buffer,
      samples.colors.buffer,
      samples.groups.buffer,
      samples.boxes.buffer,
    );
  }
  return buffers as ArrayBuffer[];
}
