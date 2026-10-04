import type { RGB } from "./color";

/** A pinned swatch: the color it keeps and the swatch that keeps it. */
export interface Lock {
  id: string;
  color: RGB;
}

/**
 * Pins a swatch that is not pinned, or lets go of one that is. A palette can
 * hold the same color twice, so a pin follows the swatch's id: unpinning one
 * copy must free that swatch and leave the other pinned.
 */
export function toggleLocked(locks: Lock[], id: string, color: RGB): Lock[] {
  return locks.some((lock) => lock.id === id)
    ? locks.filter((lock) => lock.id !== id)
    : [...locks, { id, color }];
}

let pins = 0;

/** An id for a pinned swatch that has no swatch on screen yet. */
export const newPinId = () => `pin-${++pins}`;

/** Pins every color, each as its own swatch. */
export const locksFor = (colors: RGB[]): Lock[] =>
  colors.map((color) => ({ id: newPinId(), color }));

/**
 * The pin holding a swatch, read from the current locks. A swatch is pinned
 * when a lock names the pin the palette gave it, or the swatch itself (a pin
 * made on a swatch the palette has not caught up with yet).
 */
export const pinOn = (
  locks: Lock[],
  swatch: { id: string; lockId?: string },
): string | undefined =>
  locks.find((lock) => lock.id === swatch.lockId || lock.id === swatch.id)?.id;
