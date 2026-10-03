import { describe, expect, it } from "vitest";
import { MAX_CHROMA, makeEdit, nudgeEdit, stepForKey, valueOf } from "./nudge";
import { EDIT_KEYS } from "./swatchEdits";

const red = { r: 200, g: 60, b: 60 };

describe("edit keys", () => {
  it("map each key to one step, and Home to undo", () => {
    expect(stepForKey("ArrowUp")).toEqual({ l: 0.02 });
    expect(stepForKey("ArrowLeft")).toEqual({ h: -5 });
    expect(stepForKey("PageDown")).toEqual({ c: -0.01 });
    expect(stepForKey("Home")).toBeNull();
  });

  it("are the same keys the swatch listens for", () => {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
      expect(EDIT_KEYS.test(key)).toBe(true);
    for (const key of ["PageUp", "PageDown", "Home"])
      expect(EDIT_KEYS.test(key)).toBe(true);
    for (const key of ["a", "1", "Enter", "End", "Tab"])
      expect(EDIT_KEYS.test(key)).toBe(false);
  });
});

describe("nudging", () => {
  it("starts from the extracted color and records the color it makes", () => {
    const edit = nudgeEdit(red, null, { l: 0.1 });
    expect(edit.L).toBeCloseTo(valueOf(red, null).L + 0.1, 6);
    expect(edit.color).not.toEqual(red);
  });

  it("clamps lightness and chroma and wraps hue", () => {
    const top = nudgeEdit(red, makeEdit({ L: 0.99, C: 0.1, h: 10 }), {
      l: 0.5,
    });
    expect(top.L).toBe(1);
    const flat = nudgeEdit(red, makeEdit({ L: 0.5, C: 0.005, h: 10 }), {
      c: -1,
    });
    expect(flat.C).toBe(0);
    const wide = nudgeEdit(red, makeEdit({ L: 0.5, C: 0.1, h: 10 }), { c: 1 });
    expect(wide.C).toBe(MAX_CHROMA);
    const wrapped = nudgeEdit(red, makeEdit({ L: 0.5, C: 0.1, h: 358 }), {
      h: 5,
    });
    expect(wrapped.h).toBeCloseTo(3, 6);
    const back = nudgeEdit(red, makeEdit({ L: 0.5, C: 0.1, h: 2 }), { h: -5 });
    expect(back.h).toBeCloseTo(357, 6);
  });
});
