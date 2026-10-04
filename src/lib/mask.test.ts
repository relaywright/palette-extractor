import { describe, expect, it } from "vitest";
import {
  hardMask,
  litSamples,
  maskPopulation,
  maskRadius,
  scrimPixels,
  softMask,
} from "./mask";

/** A 20 by 10 image sampled every other pixel; the left half is group 0. */
function fixture() {
  const width = 20,
    height = 10;
  const points: [number, number][] = [];
  for (let y = 0; y < height; y += 1)
    for (let x = y % 2; x < width; x += 2) points.push([x, y]);
  const positions = new Uint16Array(points.flat());
  const groups = Uint8Array.from(points, ([x]) => (x < 10 ? 0 : 1));
  return { width, height, positions, groups };
}

describe("hardMask", () => {
  it("sets one pixel per lit sample", () => {
    const samples = fixture();
    const lit = [1, 0];
    const mask = hardMask(samples, lit);
    expect(maskPopulation(mask)).toBe(litSamples(samples.groups, lit));
    expect(mask[0 * 20 + 0]).toBe(1);
    expect(mask[0 * 20 + 15]).toBe(0);
  });

  it("is empty when no group is lit", () => {
    const samples = fixture();
    expect(maskPopulation(hardMask(samples, [0, 0]))).toBe(0);
  });

  it("ignores samples outside the image", () => {
    const samples = {
      width: 4,
      height: 4,
      positions: new Uint16Array([1, 1, 9, 9]),
      groups: new Uint8Array([0, 0]),
    };
    expect(maskPopulation(hardMask(samples, [1]))).toBe(1);
  });
});

describe("softMask", () => {
  it("covers the lit region and leaves the rest clear", () => {
    const samples = fixture();
    const soft = softMask(samples, [1, 0], 2);
    expect(soft[5 * 20 + 3]).toBe(255);
    expect(soft[5 * 20 + 17]).toBe(0);
  });

  it("fades across the boundary", () => {
    const samples = fixture();
    const soft = softMask(samples, [1, 0], 2);
    const edge = soft[5 * 20 + 10];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });
});

describe("scrimPixels", () => {
  it("dims uncovered pixels and clears covered ones", () => {
    const pixels = scrimPixels(Uint8ClampedArray.from([0, 255]), 0.5);
    expect(pixels[3]).toBe(128);
    expect(pixels[7]).toBe(0);
  });
});

describe("maskRadius", () => {
  it("grows as the samples thin out", () => {
    const dense = maskRadius({
      width: 100,
      height: 100,
      groups: new Uint8Array(10000),
    });
    const sparse = maskRadius({
      width: 100,
      height: 100,
      groups: new Uint8Array(400),
    });
    expect(dense).toBe(2);
    expect(sparse).toBeGreaterThan(dense);
  });
});
