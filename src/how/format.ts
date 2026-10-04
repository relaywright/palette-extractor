import type { ColorSpace, RGB } from "@relaywright/median-cut";
import type { Axis } from "./splitMath";

export const hex = ({ r, g, b }: RGB) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export const css = ({ r, g, b }: RGB) => `rgb(${r} ${g} ${b})`;

export const count = (value: number) => value.toLocaleString("en-US");

export const percent = (part: number, whole: number) => {
  const share = whole ? (part / whole) * 100 : 0;
  return `${share < 10 && share > 0 ? share.toFixed(1) : Math.round(share)}%`;
};

export const AXIS_NAMES: Record<ColorSpace, [string, string, string]> = {
  rgb: ["red", "green", "blue"],
  oklab: ["lightness", "green to red", "blue to yellow"],
};

export const AXIS_LETTERS: Record<ColorSpace, [string, string, string]> = {
  rgb: ["R", "G", "B"],
  oklab: ["L", "a", "b"],
};

/** A strip showing what moving along one axis does to color. */
export function axisGradient(space: ColorSpace, axis: Axis): string {
  if (space === "rgb")
    return `linear-gradient(90deg, #000, ${["#f00", "#0f0", "#00f"][axis]})`;
  return [
    "linear-gradient(90deg, #000, #fff)",
    "linear-gradient(90deg, #00b389, #8a8a8a, #e0457b)",
    "linear-gradient(90deg, #3366ee, #8a8a8a, #e8c52c)",
  ][axis];
}
