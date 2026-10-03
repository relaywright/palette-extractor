import { useCallback, useMemo, useReducer } from "react";
import { type RGB, rgbToHex } from "../lib/color";

/** A swatch's edited OKLCH coordinates and the sRGB color they make. */
export interface PaletteEdit {
  L: number;
  C: number;
  h: number;
  color: RGB;
}

/**
 * Edits are keyed by the extracted color's hex, so they stay with their
 * swatch through sorts. `signature` names the extraction they belong to.
 */
export interface EditState {
  signature: string;
  edits: Record<string, PaletteEdit>;
  /** Some swatch was edited since this extraction, even if reset since. */
  touched: boolean;
}

/** An edit, or a function from the swatch's latest edit to its next one. */
export type EditUpdate =
  | PaletteEdit
  | null
  | ((previous: PaletteEdit | null) => PaletteEdit | null);

export type EditAction =
  | { type: "set"; signature: string; hex: string; edit: EditUpdate }
  | { type: "reset"; signature: string };

export const emptyEdits = (signature: string): EditState => ({
  signature,
  edits: {},
  touched: false,
});

/** Identifies an extraction: the photo plus the set of colors it produced. */
export const paletteSignature = (colors: RGB[], photo: string) =>
  `${photo}|${colors.map(rgbToHex).sort().join(".")}`;

export function editsReducer(state: EditState, action: EditAction): EditState {
  // An edit made against another extraction starts from nothing.
  const base =
    state.signature === action.signature ? state : emptyEdits(action.signature);
  switch (action.type) {
    case "reset":
      return { ...base, edits: {} };
    case "set": {
      const edits = { ...base.edits };
      const { hex } = action;
      const edit =
        typeof action.edit === "function"
          ? action.edit(edits[hex] ?? null)
          : action.edit;
      if (edit) edits[hex] = edit;
      else delete edits[hex];
      return { ...base, edits, touched: base.touched || !!edit };
    }
  }
}

/**
 * The extracted palette with each edit applied. A swatch whose edit changes
 * nothing visible keeps its extracted color object, and the same array comes
 * back when no swatch changed, so `colors[i] !== extracted[i]` means edited.
 */
export function editedPalette(
  extracted: RGB[],
  edits: Record<string, PaletteEdit>,
): RGB[] {
  const next = extracted.map((color) => {
    const edit = edits[rgbToHex(color)];
    return edit && rgbToHex(edit.color) !== rgbToHex(color)
      ? edit.color
      : color;
  });
  return next.some((color, i) => color !== extracted[i]) ? next : extracted;
}

/**
 * The edit layer between the extracted palette and everything that shows
 * or exports it. `colors` is the palette to display, in the order of
 * `extracted`; `current` is each swatch's stored edit, if it has one.
 * Edits drop when the photo or the extracted set changes.
 */
export function usePaletteEdits(extracted: RGB[], photo: string) {
  const hexes = useMemo(() => extracted.map(rgbToHex), [extracted]);
  const signature = paletteSignature(extracted, photo);
  const [stored, dispatch] = useReducer(editsReducer, signature, emptyEdits);
  const stale = stored.signature !== signature;
  // Letting go of an old extraction's edits during render (a reset against
  // a new signature starts empty), so nothing ever paints them against a new
  // palette.
  if (stale) dispatch({ type: "reset", signature });
  const state = stale ? emptyEdits(signature) : stored;

  const colors = useMemo(
    () => editedPalette(extracted, state.edits),
    [extracted, state.edits],
  );

  const setEdit = useCallback(
    (index: number, edit: EditUpdate) => {
      if (hexes[index])
        dispatch({ type: "set", signature, hex: hexes[index], edit });
    },
    [hexes, signature],
  );
  const resetAll = useCallback(
    () => dispatch({ type: "reset", signature }),
    [signature],
  );

  return {
    colors,
    current: hexes.map((hex) => state.edits[hex] ?? null),
    touched: state.touched,
    setEdit,
    resetAll,
  };
}
