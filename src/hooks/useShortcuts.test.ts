import { describe, expect, it } from "vitest";
import { type KeyInfo, shortcutAction } from "./useShortcuts";

const press = (key: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe("shortcutAction", () => {
  it("maps 1 to 9 to swatches 1 to 9 and 0 to the tenth", () => {
    expect(shortcutAction(press("1"))).toEqual({ type: "select", index: 0 });
    expect(shortcutAction(press("3"))).toEqual({ type: "select", index: 2 });
    expect(shortcutAction(press("9"))).toEqual({ type: "select", index: 8 });
    expect(shortcutAction(press("0"))).toEqual({ type: "select", index: 9 });
  });
  it("copies the value on C and the palette on Shift+C", () => {
    expect(shortcutAction(press("c"))).toEqual({ type: "copy-value" });
    expect(shortcutAction(press("C", { shiftKey: true }))).toEqual({
      type: "copy-palette",
    });
  });
  it("copies the share link on S", () => {
    expect(shortcutAction(press("s"))).toEqual({ type: "copy-share" });
    expect(shortcutAction(press("S", { shiftKey: true }))).toBeNull();
  });
  it("opens the sheet on ? with or without Shift reported", () => {
    expect(shortcutAction(press("?", { shiftKey: true }))).toEqual({
      type: "help",
    });
    expect(shortcutAction(press("?"))).toEqual({ type: "help" });
  });
  it("leaves browser and screen reader combinations alone", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const)
      for (const key of ["1", "c", "s", "?"])
        expect(shortcutAction(press(key, { [mod]: true }))).toBeNull();
  });
  it("ignores shifted digits and unrelated keys", () => {
    expect(shortcutAction(press("!", { shiftKey: true }))).toBeNull();
    expect(shortcutAction(press("1", { shiftKey: true }))).toBeNull();
    expect(shortcutAction(press("x"))).toBeNull();
    expect(shortcutAction(press("Enter"))).toBeNull();
  });
});
