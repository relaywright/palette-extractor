import { createContext } from "react";

export interface SwatchEditsApi {
  /** IDs of the swatches whose color differs from the extracted one. */
  edited: ReadonlySet<string>;
  /** The selected swatch's adjust panel is open. */
  adjusting: boolean;
  /** "adjust" toggles the panel; any of EDIT_KEYS edits that swatch. */
  act: (id: string, action: string) => void;
}

/**
 * Lets a swatch show its edit marker and take edit keys without the grid
 * above it knowing about editing.
 */
export const SwatchEditsContext = createContext<SwatchEditsApi>({
  edited: new Set(),
  adjusting: false,
  act: () => {},
});

// Shift with an arrow key: browsers and screen readers leave it alone on a
// focused button. Up and down move lightness, left and right move hue, Page
// Up and Page Down move chroma, and Home puts the swatch back.
export const EDIT_KEYS = /^(Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home)$/;
