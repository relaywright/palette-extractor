import { describe, expect, it } from "vitest";
import { type RGB, rgbToHex } from "../lib/color";
import { makeEdit } from "../recolor/nudge";
import {
  type EditState,
  editedPalette,
  editsReducer,
  emptyEdits,
  paletteSignature,
} from "./usePaletteEdits";

const extracted: RGB[] = [
  { r: 200, g: 60, b: 60 },
  { r: 40, g: 120, b: 200 },
  { r: 230, g: 220, b: 90 },
];
const signature = paletteSignature(extracted, "photo.jpg");
const hexes = extracted.map(rgbToHex);
const ids = ["swatch-1", "swatch-2", "swatch-3"];
const hexSet = (colors: RGB[]) => colors.map(rgbToHex);

const edit = (state: EditState, index: number, lightness: number) =>
  editsReducer(state, {
    type: "set",
    signature,
    id: ids[index],
    edit: makeEdit({ L: lightness, C: 0.12, h: 40 }),
  });

describe("palette edits", () => {
  it("shows the extracted array itself when nothing is edited", () => {
    expect(editedPalette(extracted, ids, emptyEdits(signature).edits)).toBe(
      extracted,
    );
  });

  it("applies an edit to its swatch only", () => {
    const state = edit(emptyEdits(signature), 1, 0.8);
    const shown = editedPalette(extracted, ids, state.edits);
    expect(shown[0]).toBe(extracted[0]);
    expect(shown[2]).toBe(extracted[2]);
    expect(rgbToHex(shown[1])).not.toBe(hexes[1]);
  });

  it("reset restores the exact extracted hex set", () => {
    let state = edit(edit(emptyEdits(signature), 0, 0.3), 2, 0.9);
    expect(hexSet(editedPalette(extracted, ids, state.edits))).not.toEqual(
      hexes,
    );
    state = editsReducer(state, { type: "reset", signature });
    expect(hexSet(editedPalette(extracted, ids, state.edits))).toEqual(hexes);
    expect(state.touched).toBe(true);
  });

  it("follows a swatch through a re-sort, because edits are keyed by swatch", () => {
    const state = edit(emptyEdits(signature), 0, 0.8);
    const sorted = [extracted[2], extracted[0], extracted[1]];
    const shown = editedPalette(sorted, [ids[2], ids[0], ids[1]], state.edits);
    expect(rgbToHex(shown[1])).not.toBe(hexes[0]);
    expect(shown[0]).toBe(extracted[2]);
    expect(paletteSignature(sorted, "photo.jpg")).toBe(signature);
  });

  it("drops edits when the extraction changes", () => {
    const state = edit(emptyEdits(signature), 0, 0.8);
    const other = paletteSignature(extracted.slice(0, 2), "photo.jpg");
    expect(other).not.toBe(signature);
    const next = editsReducer(state, { type: "reset", signature: other });
    expect(next.edits).toEqual({});
    expect(next.touched).toBe(false);
    expect(paletteSignature(extracted, "other.jpg")).not.toBe(signature);
  });

  it("takes an update function against the latest edit", () => {
    let state = edit(emptyEdits(signature), 0, 0.5);
    const bump = (previous: ReturnType<typeof makeEdit> | null) =>
      makeEdit({ L: previous!.L + 0.1, C: previous!.C, h: previous!.h });
    for (let i = 0; i < 3; i++)
      state = editsReducer(state, {
        type: "set",
        signature,
        id: ids[0],
        edit: bump,
      });
    expect(state.edits[ids[0]].L).toBeCloseTo(0.8, 9);
  });

  it("removes an edit set to null, and shows a no-op color as unedited", () => {
    let state = edit(emptyEdits(signature), 0, 0.8);
    state = editsReducer(state, {
      type: "set",
      signature,
      id: ids[0],
      edit: null,
    });
    expect(state.edits[ids[0]]).toBeUndefined();
    const gray = [{ r: 128, g: 128, b: 128 }];
    const hueOnly = editsReducer(emptyEdits("g"), {
      type: "set",
      signature: "g",
      id: "swatch-1",
      edit: makeEdit({ L: 0.5999, C: 0, h: 200 }),
    });
    expect(editedPalette(gray, ["swatch-1"], hueOnly.edits)).toBe(gray);
  });

  it("edits one of two swatches that share a color, not both", () => {
    const twins = [extracted[0], { ...extracted[0] }, extracted[1]];
    const twinIds = ["a", "b", "c"];
    const state = editsReducer(emptyEdits("t"), {
      type: "set",
      signature: "t",
      id: "b",
      edit: makeEdit({ L: 0.8, C: 0.12, h: 40 }),
    });
    const shown = editedPalette(twins, twinIds, state.edits);
    expect(shown[0]).toBe(twins[0]);
    expect(rgbToHex(shown[1])).not.toBe(rgbToHex(twins[1]));
    expect(shown[2]).toBe(twins[2]);
  });

  it("keeps an edit on its swatch when the edit makes it match another", () => {
    // Black raised to full lightness is the white beside it.
    const pair = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
    const state = editsReducer(emptyEdits("p"), {
      type: "set",
      signature: "p",
      id: "black",
      edit: makeEdit({ L: 1, C: 0, h: 0 }),
    });
    const shown = editedPalette(pair, ["black", "white"], state.edits);
    expect(hexSet(shown)).toEqual(["#ffffff", "#ffffff"]);
    expect(shown[1]).toBe(pair[1]);
  });
});
