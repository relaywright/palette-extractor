import { describe, expect, it } from "vitest";
import {
  analyze,
  paletteFor,
  workingSize,
  type SpaceAnalysis,
} from "./analysis";
import {
  axisHistogram,
  countBetween,
  cutValueOf,
  describeSplit,
  medianOf,
  pickBox,
  ruleFor,
  scoreBoxes,
  snapBoxes,
} from "./splitMath";

const WIDTH = 64;
const HEIGHT = 48;

/** Clusters of color with deterministic noise, a few of them small. */
function photo() {
  const clusters: [number, number, number, number][] = [
    [200, 60, 50, 40],
    [30, 90, 160, 30],
    [235, 225, 190, 15],
    [20, 25, 30, 10],
    [90, 160, 70, 4],
    [240, 150, 20, 1],
  ];
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  let seed = 7;
  const noise = (spread: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return Math.round(((seed >>> 8) / 2 ** 24 - 0.5) * spread);
  };
  const total = clusters.reduce((sum, c) => sum + c[3], 0);
  for (let q = 0; q < WIDTH * HEIGHT; q++) {
    let pick = (q * 7919) % total;
    const cluster = clusters.find((c) => (pick -= c[3]) < 0)!;
    for (let k = 0; k < 3; k++)
      rgba[q * 4 + k] = Math.min(255, Math.max(0, cluster[k] + noise(36)));
    rgba[q * 4 + 3] = 255;
  }
  return rgba;
}

const rgba = photo();
const analysis = analyze(rgba, WIDTH, HEIGHT, 8);

describe.each([["rgb"], ["oklab"]] as const)("splits in %s", (space) => {
  const run: SpaceAnalysis = analysis[space];
  const splits = run.steps.length - 1;
  const n = analysis.pixelCount;

  it("has one split fewer than there are boxes", () => {
    expect(splits).toBe(analysis.count - 1);
    expect(run.steps[splits]).toHaveLength(analysis.count);
  });

  it("reads each split back from the boxes", () => {
    for (let k = 1; k <= splits; k++) {
      const info = describeSplit(run.steps, k, analysis.count);
      const before = run.steps[k - 1][info.boxIndex];
      expect(info.lowPopulation + info.highPopulation).toBe(before.population);
      expect(info.lowMax).toBeLessThanOrEqual(info.highMin);
      // The cut runs along the box's widest side.
      const ranges = [0, 1, 2].map(
        (a) => info.bounds.max[a] - info.bounds.min[a],
      );
      expect(ranges[info.axis]).toBe(Math.max(...ranges));
    }
  });

  it("puts the cut the quantizer's formula gives between the two sides", () => {
    for (let k = 1; k <= splits; k++) {
      const info = describeSplit(run.steps, k, analysis.count);
      const counts = axisHistogram(
        run.coords,
        run.boxes,
        n,
        k - 1,
        info.boxIndex,
        info.axis,
      );
      expect(counts.reduce((a, b) => a + b, 0)).toBe(
        run.steps[k - 1][info.boxIndex].population,
      );
      const median = medianOf(counts);
      const cut = cutValueOf(
        info.bounds.min[info.axis],
        info.bounds.max[info.axis],
        median,
      );
      expect(info.lowMax).toBeLessThanOrEqual(cut);
      expect(cut).toBeLessThan(info.highMin);
      // Everything at or under the cut went low, everything over it high.
      expect(countBetween(counts, -1, cut)).toBe(info.lowPopulation);
    }
  });

  it("picks the split box by the rule the quantizer applies", () => {
    for (let k = 1; k <= splits; k++) {
      const info = describeSplit(run.steps, k, analysis.count);
      const scores = scoreBoxes(run.steps[k - 1], info.rule);
      expect(pickBox(scores)).toBe(info.boxIndex);
    }
  });

  it("switches from population to volume for the last quarter of splits", () => {
    const rules = Array.from({ length: splits }, (_, k) =>
      ruleFor(run.steps[k].length, analysis.count),
    );
    expect(rules.slice(0, 5)).toEqual(Array(5).fill("population"));
    expect(rules.slice(5)).toEqual(["volume", "volume"]);
  });
});

describe("snapping", () => {
  const run = analysis.rgb;
  const last = run.steps.length - 1;
  const snaps = snapBoxes(run.steps[last], analysis.pixels, run.boxes, last);

  it("snaps each box to one of its own pixels, the one nearest the average", () => {
    const n = analysis.pixelCount;
    snaps.forEach((snap, b) => {
      let nearest = Infinity;
      let found = false;
      for (let i = 0; i < n; i++) {
        if (run.boxes[last * n + i] !== b) continue;
        const [r, g, bl] = [
          analysis.pixels[i * 3],
          analysis.pixels[i * 3 + 1],
          analysis.pixels[i * 3 + 2],
        ];
        nearest = Math.min(
          nearest,
          Math.hypot(
            r - snap.average.r,
            g - snap.average.g,
            bl - snap.average.b,
          ),
        );
        if (
          r === snap.snapped.r &&
          g === snap.snapped.g &&
          bl === snap.snapped.b
        )
          found = true;
      }
      expect(found).toBe(true);
      expect(snap.distance).toBeCloseTo(nearest, 9);
    });
  });
});

describe("palettes and sizes", () => {
  it("matches the quantizer's own palette for the same count", () => {
    const colors = paletteFor(rgba, 8);
    expect(colors.map((c) => c.color)).toEqual(
      analysis.rgb.colors.map((c) => c.color),
    );
  });

  it("caps the working image at 320 px on the longest edge", () => {
    expect(workingSize(4000, 3000)).toEqual({ width: 320, height: 240 });
    expect(workingSize(300, 200)).toEqual({ width: 300, height: 200 });
    expect(workingSize(1, 5000)).toEqual({ width: 1, height: 320 });
  });

  it("rejects a fully transparent image", () => {
    expect(() => analyze(new Uint8ClampedArray(16), 2, 2)).toThrow(
      /transparent/,
    );
  });
});
