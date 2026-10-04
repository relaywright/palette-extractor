import { describe, expect, it } from "vitest";
import { type RGB, rgbToHex } from "../lib/color";
import { makeEdit } from "../recolor/nudge";
import {
  type EditState,
  editedPalette,
  editsReducer,
  emptyEdits,
  paletteSignature,
  type Retargeted,
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

  describe("across a pin", () => {
    const photo = "photo.jpg";
    const next = paletteSignature(extracted.slice(1), photo);
    // What a pin records: the swatches' extracted colors, and the pins that
    // were already there.
    const pin = (state: EditState, pins: string[] = []) =>
      editsReducer(state, {
        type: "pin",
        photo,
        extracted: Object.fromEntries(ids.map((id, i) => [id, extracted[i]])),
        pins,
      });
    const retarget = (
      state: EditState,
      signature: string,
      swatches: Retargeted[],
      forPhoto = photo,
    ) =>
      editsReducer(state, {
        type: "retarget",
        signature,
        photo: forPhoto,
        swatches,
      });
    const pinned: RGB = { r: 40, g: 200, b: 120 };
    // The first swatch is gone; a new pin takes the fourth swatch's place.
    const afterPin: Retargeted[] = [
      { id: "swatch-2", extracted: extracted[1] },
      { id: "swatch-4", extracted: pinned, pin: "pin-1" },
    ];

    it("keeps the edits of the swatches that are still there", () => {
      let state = edit(edit(emptyEdits(signature), 0, 0.3), 1, 0.8);
      state = pin(state);
      const after = retarget(state, next, afterPin);
      expect(Object.keys(after.edits)).toEqual(["swatch-2"]);
      expect(after.edits["swatch-2"]).toBe(state.edits["swatch-2"]);
      expect(after.signature).toBe(next);
      expect(after.touched).toBe(true);
      expect(after.carrying).toBeNull();
    });

    it("drops them without a pin", () => {
      const state = edit(emptyEdits(signature), 1, 0.8);
      const after = retarget(state, next, afterPin);
      expect(after.edits).toEqual({});
      expect(after.touched).toBe(false);
    });

    it("drops them when the photo changed after the pin", () => {
      let state = edit(emptyEdits(signature), 1, 0.8);
      state = pin(state);
      const after = retarget(
        state,
        paletteSignature(extracted, "other.jpg"),
        ids.map((id, i) => ({ id, extracted: extracted[i] })),
        "other.jpg",
      );
      expect(after.edits).toEqual({});
    });

    it("carries once: a pin that changed nothing does not leak into later changes", () => {
      let state = edit(emptyEdits(signature), 1, 0.8);
      state = pin(state);
      state = editsReducer(state, { type: "settle" });
      expect(
        retarget(
          state,
          next,
          ids.map((id, i) => ({ id, extracted: extracted[i] })),
        ).edits,
      ).toEqual({});
    });

    it("never gives an edit to the swatch that holds the new pin, even when the pin is next to the edited color", () => {
      let state = edit(emptyEdits(signature), 0, 0.3);
      state = pin(state);
      // The pin was taken beside swatch-1's color and the pairing handed it
      // swatch-1's ID.
      const after = retarget(state, next, [
        { id: "swatch-1", extracted: { r: 201, g: 60, b: 60 }, pin: "pin-1" },
        { id: "swatch-2", extracted: extracted[1] },
      ]);
      expect(after.edits).toEqual({});
    });

    it("keeps the edit of a swatch whose color only shifted a little", () => {
      let state = edit(emptyEdits(signature), 1, 0.8);
      state = pin(state);
      const after = retarget(state, next, [
        { id: "swatch-2", extracted: { r: 52, g: 128, b: 196 } },
        { id: "swatch-4", extracted: pinned, pin: "pin-1" },
      ]);
      expect(Object.keys(after.edits)).toEqual(["swatch-2"]);
    });

    it("drops an edit whose swatch was handed a different color", () => {
      let state = edit(emptyEdits(signature), 0, 0.3);
      state = pin(state);
      const after = retarget(state, next, [
        { id: "swatch-1", extracted: extracted[2] },
        { id: "swatch-2", extracted: extracted[1] },
      ]);
      expect(after.edits).toEqual({});
    });

    it("keeps the edit of a swatch that was already pinned", () => {
      let state = edit(emptyEdits(signature), 0, 0.3);
      state = pin(state, ["pin-0"]);
      const after = retarget(state, next, [
        { id: "swatch-1", extracted: extracted[0], pin: "pin-0" },
        { id: "swatch-4", extracted: pinned, pin: "pin-1" },
      ]);
      expect(Object.keys(after.edits)).toEqual(["swatch-1"]);
    });
  });
});
