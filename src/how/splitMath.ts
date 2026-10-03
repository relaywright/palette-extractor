import type { Pixel, RGB, SplitStep } from "@relaywright/median-cut";

export type Axis = 0 | 1 | 2;
export type SplitRule = "population" | "volume";

/** What one split did, read back from the boxes before and after it. */
export interface SplitInfo {
  /** 1-based: split k turns steps[k - 1] into steps[k]. */
  split: number;
  /** Position of the split box in steps[split - 1]. */
  boxIndex: number;
  axis: Axis;
  /** The box before the cut, in the run's 0-255 coordinates. */
  bounds: { min: Pixel; max: Pixel };
  /** Highest value on the low side and lowest on the high side. */
  lowMax: number;
  highMin: number;
  lowPopulation: number;
  highPopulation: number;
  rule: SplitRule;
}

const rangesOf = ({ min, max }: { min: Pixel; max: Pixel }): Pixel => [
  max[0] - min[0],
  max[1] - min[1],
  max[2] - min[2],
];

/**
 * The rule the quantizer uses once `boxCount` boxes exist: population for
 * the first three quarters of the splits, population times volume after.
 */
export function ruleFor(boxCount: number, colorCount: number): SplitRule {
  return boxCount >= Math.ceil(colorCount * 0.75) ? "volume" : "population";
}

/**
 * Finds the box a split divided. Its two halves take its place in the list
 * and later boxes shift up by one, so the first box that differs is it.
 */
export function describeSplit(
  steps: SplitStep[],
  split: number,
  colorCount: number,
): SplitInfo {
  const before = steps[split - 1];
  const after = steps[split];
  let boxIndex = 0;
  while (
    boxIndex < before.length &&
    before[boxIndex].population === after[boxIndex].population &&
    before[boxIndex].bounds.min.join() === after[boxIndex].bounds.min.join() &&
    before[boxIndex].bounds.max.join() === after[boxIndex].bounds.max.join()
  )
    boxIndex++;
  const { bounds } = before[boxIndex];
  const ranges = rangesOf(bounds);
  const axis = ranges.indexOf(Math.max(...ranges)) as Axis;
  const low = after[boxIndex];
  const high = after[boxIndex + 1];
  return {
    split,
    boxIndex,
    axis,
    bounds,
    lowMax: low.bounds.max[axis],
    highMin: high.bounds.min[axis],
    lowPopulation: low.population,
    highPopulation: high.population,
    rule: ruleFor(before.length, colorCount),
  };
}

/** How many pixels of one box sit at each value of one axis, 0 to 255. */
export function axisHistogram(
  coords: Uint8Array,
  boxes: Uint16Array,
  pixelCount: number,
  step: number,
  boxIndex: number,
  axis: Axis,
): Uint32Array {
  const counts = new Uint32Array(256);
  const row = step * pixelCount;
  for (let i = 0; i < pixelCount; i++)
    if (boxes[row + i] === boxIndex) counts[coords[i * 3 + axis]]++;
  return counts;
}

/** The value the sorted pixels reach at their halfway position. */
export function medianOf(counts: Uint32Array): number {
  let total = 0;
  for (const count of counts) total += count;
  const target = Math.floor(total / 2);
  let seen = 0;
  for (let value = 0; value < 256; value++) {
    seen += counts[value];
    if (seen > target) return value;
  }
  return 255;
}

/**
 * Where the quantizer places the cut: the median, moved toward the middle of
 * the wider side of the box's range.
 */
export function cutValueOf(min: number, max: number, median: number): number {
  const leftSpan = median - min;
  const rightSpan = max - median;
  return leftSpan <= rightSpan
    ? Math.min(max - 1, Math.floor(median + rightSpan / 2))
    : Math.max(min, Math.floor(median - 1 - leftSpan / 2));
}

/** Pixels whose value is above `from` and at most `to`. */
export function countBetween(
  counts: Uint32Array,
  from: number,
  to: number,
): number {
  let total = 0;
  for (let value = Math.max(0, from + 1); value <= Math.min(255, to); value++)
    total += counts[value];
  return total;
}

export interface BoxScore {
  index: number;
  population: number;
  /** Cells of the color space the box spans (its three sides, each plus one). */
  volume: number;
  /** Null when the box cannot be split: one pixel, or one color. */
  score: number | null;
}

/** What each box in a step is worth under a rule. */
export function scoreBoxes(step: SplitStep, rule: SplitRule): BoxScore[] {
  return step.map(({ bounds, population }, index) => {
    const ranges = rangesOf(bounds);
    const volume = (ranges[0] + 1) * (ranges[1] + 1) * (ranges[2] + 1);
    const splittable = population >= 2 && Math.max(...ranges) > 0;
    return {
      index,
      population,
      volume,
      score: splittable
        ? rule === "volume"
          ? population * volume
          : population
        : null,
    };
  });
}

/** The box a rule picks: the highest score, the first of any tie. */
export function pickBox(scores: BoxScore[]): number {
  let best = -1;
  let bestScore = -1;
  for (const { index, score } of scores)
    if (score !== null && score > bestScore) {
      best = index;
      bestScore = score;
    }
  return best;
}

export interface SnapInfo {
  /** The mean of the box's pixels, rounded per channel. */
  average: RGB;
  /** The box's own pixel nearest that mean, which becomes the swatch. */
  snapped: RGB;
  /** Straight-line RGB distance between the two. */
  distance: number;
  /** Whether any pixel of the whole photo is exactly the average color. */
  averageInPhoto: boolean;
  population: number;
}

/**
 * Before and after of the snap for every box in a step, in RGB. `pixels` is
 * the photo's colors and `boxes` the step's row of box indexes.
 */
export function snapBoxes(
  step: SplitStep,
  pixels: Uint8Array,
  boxes: Uint16Array,
  stepIndex: number,
): SnapInfo[] {
  const n = pixels.length / 3;
  const row = stepIndex * n;
  const sums = step.map(() => [0, 0, 0, 0]);
  const present = new Set<number>();
  for (let i = 0; i < n; i++) {
    const s = sums[boxes[row + i]];
    s[0] += pixels[i * 3];
    s[1] += pixels[i * 3 + 1];
    s[2] += pixels[i * 3 + 2];
    s[3]++;
    present.add(
      (pixels[i * 3] << 16) | (pixels[i * 3 + 1] << 8) | pixels[i * 3 + 2],
    );
  }
  return step.map(({ color, population }, b) => {
    const [r, g, bl, count] = sums[b];
    const average = {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(bl / count),
    };
    return {
      average,
      snapped: color,
      distance: Math.hypot(
        average.r - color.r,
        average.g - color.g,
        average.b - color.b,
      ),
      averageInPhoto: present.has(
        (average.r << 16) | (average.g << 8) | average.b,
      ),
      population,
    };
  });
}
