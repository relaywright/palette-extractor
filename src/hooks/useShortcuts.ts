import { useEffect, useRef } from "react";

export type ShortcutAction =
  | { type: "select"; index: number }
  | { type: "copy-value" }
  | { type: "copy-palette" }
  | { type: "copy-share" }
  | { type: "help" };

export interface KeyInfo {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * What a key press means, ignoring where it happened. Digits 1 to 9 pick
 * swatches 1 to 9 and 0 picks the tenth. Any Ctrl, Meta or Alt belongs to the
 * browser or the screen reader, so those presses map to nothing.
 */
export function shortcutAction(e: KeyInfo): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^[0-9]$/.test(e.key)) {
    return e.shiftKey ? null : { type: "select", index: (+e.key + 9) % 10 };
  }
  if (e.key === "?") return { type: "help" };
  switch (e.key.toLowerCase()) {
    case "c":
      return { type: e.shiftKey ? "copy-palette" : "copy-value" };
    case "s":
      return e.shiftKey ? null : { type: "copy-share" };
    default:
      return null;
  }
}

/** True for places where letters and digits are text, not commands. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.isContentEditable
  );
}

/** A modal or other dialog is on screen; the shortcut sheet marks itself. */
const OPEN_DIALOG = "dialog[open], [role='dialog'], [role='alertdialog']";

/** Runs `onAction` for shortcut presses anywhere on the page. */
export function useShortcuts(onAction: (action: ShortcutAction) => boolean) {
  const latest = useRef(onAction);
  latest.current = onAction;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      const action = shortcutAction(e);
      if (!action || document.querySelector(OPEN_DIALOG)) return;
      // The handler says whether the key did something, so a digit past the
      // last swatch is left alone.
      if (latest.current(action)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
