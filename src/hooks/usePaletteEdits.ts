import { useCallback, useEffect, useMemo, useReducer } from "react";
import { type RGB, rgbToHex } from "../lib/color";

/** A swatch's edited OKLCH coordinates and the sRGB color they make. */
export interface PaletteEdit {
  L: number;
  C: number;
  h: number;
  color: RGB;
}

/**
 * Edits are keyed by swatch ID, so they stay with their swatch through sorts
 * and apart from another swatch that repeats its color. `signature` names the
 * extraction they belong to.
 */
export interface EditState {
  signature: string;
  edits: Record<string, PaletteEdit>;
  /** Some swatch was edited since this extraction, even if reset since. */
  touched: boolean;
  /**
   * The photo whose edits ride through the next extraction, set when a color
   * is pinned from the photo: that re-extraction is the viewer adding a
   * color, not starting over.
   */
  carrying: string | null;
}

/** An edit, or a function from the swatch's latest edit to its next one. */
export type EditUpdate =
  | PaletteEdit
  | null
  | ((previous: PaletteEdit | null) => PaletteEdit | null);

export type EditAction =
  | { type: "set"; signature: string; id: string; edit: EditUpdate }
  | { type: "reset"; signature: string }
  /** The extraction changed: keep what a pin carries, drop the rest. */
  | { type: "retarget"; signature: string; photo: string; ids: string[] }
  | { type: "pin"; photo: string }
  /** An extraction finished without needing the pin's carry. */
  | { type: "settle" };

export const emptyEdits = (signature: string): EditState => ({
  signature,
  edits: {},
  touched: false,
  carrying: null,
});

/** Identifies an extraction: the photo plus the set of colors it produced. */
export const paletteSignature = (colors: RGB[], photo: string) =>
  `${photo}|${colors.map(rgbToHex).sort().join(".")}`;

export function editsReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "pin":
      return { ...state, carrying: action.photo };
    case "settle":
      return state.carrying === null ? state : { ...state, carrying: null };
    case "retarget": {
      if (state.signature === action.signature) return state;
      // A pin changes the extracted colors but not the swatches that were
      // already there: their edits stay with them.
      if (state.carrying !== action.photo) return emptyEdits(action.signature);
      const edits = Object.fromEntries(
        Object.entries(state.edits).filter(([id]) => action.ids.includes(id)),
      );
      return { ...state, signature: action.signature, edits, carrying: null };
    }
  }
  // An edit made against another extraction starts from nothing.
  const base =
    state.signature === action.signature ? state : emptyEdits(action.signature);
  switch (action.type) {
    case "reset":
      return { ...base, edits: {} };
    case "set": {
      const edits = { ...base.edits };
      const { id } = action;
      const edit =
        typeof action.edit === "function"
          ? action.edit(edits[id] ?? null)
          : action.edit;
      if (edit) edits[id] = edit;
      else delete edits[id];
      return { ...base, edits, touched: base.touched || !!edit };
    }
  }
}

/**
 * The extracted palette with each edit applied; `ids` names each color's
 * swatch. A swatch whose edit changes nothing visible keeps its extracted
 * color object, and the same array comes back when no swatch changed, so
 * `colors[i] !== extracted[i]` means edited.
 */
export function editedPalette(
  extracted: RGB[],
  ids: string[],
  edits: Record<string, PaletteEdit>,
): RGB[] {
  const next = extracted.map((color, i) => {
    const edit = edits[ids[i]];
    return edit && rgbToHex(edit.color) !== rgbToHex(color)
      ? edit.color
      : color;
  });
  return next.some((color, i) => color !== extracted[i]) ? next : extracted;
}

/**
 * The edit layer between the extracted palette and everything that shows
 * or exports it. `ids` names the swatch of each extracted color, from the
 * unedited extraction. `colors` is the palette to display, in the order of
 * `extracted`; `current` is each swatch's stored edit, if it has one.
 * Edits drop when the photo or the extracted set changes, except across a
 * pin (`carryThroughPin`), where swatches that survive keep theirs.
 */
export function usePaletteEdits(
  extracted: RGB[],
  ids: string[],
  photo: string,
) {
  const signature = paletteSignature(extracted, photo);
  const [stored, dispatch] = useReducer(editsReducer, signature, emptyEdits);
  const stale = stored.signature !== signature;
  // Letting go of an old extraction's edits during render (retargeting to a
  // new signature starts empty, unless a pin is carrying them), so nothing
  // ever paints them against a new palette.
  const retarget = { type: "retarget", signature, photo, ids } as const;
  if (stale) dispatch(retarget);
  const state = stale ? editsReducer(stored, retarget) : stored;
  // A pin that left the extracted colors as they were has nothing to carry.
  useEffect(() => dispatch({ type: "settle" }), [extracted]);

  const colors = useMemo(
    () => editedPalette(extracted, ids, state.edits),
    [extracted, ids, state.edits],
  );

  const setEdit = useCallback(
    (index: number, edit: EditUpdate) => {
      if (ids[index])
        dispatch({ type: "set", signature, id: ids[index], edit });
    },
    [ids, signature],
  );
  const resetAll = useCallback(
    () => dispatch({ type: "reset", signature }),
    [signature],
  );
  const carryThroughPin = useCallback(
    () => dispatch({ type: "pin", photo }),
    [photo],
  );

  return {
    colors,
    current: ids.map((id) => state.edits[id] ?? null),
    touched: state.touched,
    signature,
    setEdit,
    resetAll,
    carryThroughPin,
  };
}
