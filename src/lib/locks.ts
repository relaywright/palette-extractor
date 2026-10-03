import { type RGB, rgbToHex } from "./color";

/**
 * Pins a color that is not pinned, or lets go of one copy of a pinned color.
 * A palette can hold the same color twice, and unpinning one swatch must not
 * unpin the other.
 */
export function toggleLocked(locked: RGB[], color: RGB): RGB[] {
  const hex = rgbToHex(color);
  const at = locked.findIndex((c) => rgbToHex(c) === hex);
  return at < 0 ? [...locked, color] : locked.filter((_, i) => i !== at);
}
