import { type RGB, relativeLuminance, rgbToHsl } from "./color";
import { oklabDistance } from "@relaywright/median-cut";
import { contrastRatio } from "./contrast";

/** Choose roles only from the extracted palette. Never invent an accessible pair. */
export function suggestRoles(palette: RGB[]) {
  if (!palette.length) return null;
  let background = palette[0],
    foreground = palette[0],
    ratio = 1;
  for (const a of palette) {
    for (const b of palette) {
      const candidate = contrastRatio(a, b);
      if (candidate > ratio) {
        ratio = candidate;
        background = relativeLuminance(a) > relativeLuminance(b) ? a : b;
        foreground = background === a ? b : a;
      }
    }
  }
  return {
    background,
    foreground,
    accent: pickAccent(palette, background, foreground),
    ratio,
  };
}

// The accent fills a button and a sticker on either surface, so it needs to
// look clearly different from both. Measured in OKLab, where a hue change
// counts as much as a lightness change; 0.02 is about the smallest visible
// step.
const ACCENT_DISTANCE = 0.1;

/** The most saturated color that stands out from both surface colors. */
function pickAccent(palette: RGB[], background: RGB, foreground: RGB) {
  const bySaturation = (list: RGB[]) =>
    [...list].sort((a, b) => rgbToHsl(b).s - rgbToHsl(a).s);
  // Compare by value: a palette can repeat a color as separate objects.
  const same = (a: RGB, b: RGB) => a.r === b.r && a.g === b.g && a.b === b.b;
  const others = palette.filter(
    (c) => !same(c, background) && !same(c, foreground),
  );
  // With only the two surface colors to choose from, the accent shares one.
  if (!others.length) return bySaturation(palette)[0];
  const apart = (c: RGB) =>
    Math.min(oklabDistance(c, background), oklabDistance(c, foreground));
  const clear = others.filter((c) => apart(c) >= ACCENT_DISTANCE);
  if (clear.length) return bySaturation(clear)[0];
  return others.reduce((best, c) => (apart(c) > apart(best) ? c : best));
}

export type RoleName = "surface" | "text" | "accent";
export const ROLE_NAMES: RoleName[] = ["surface", "text", "accent"];
/** Palette positions the user picked; a missing role keeps the suggestion. */
export type RoleChoice = Partial<Record<RoleName, number>>;
/**
 * The same picks by swatch ID, which is what survives sorting and recoloring.
 * `ids` lists the swatch at each palette position.
 */
export type RolePicks = Partial<Record<RoleName, string>>;

/** The positions of the picked swatches; a swatch no longer shown is dropped. */
export function choiceFromPicks(ids: string[], picks: RolePicks): RoleChoice {
  const choice: RoleChoice = {};
  for (const role of ROLE_NAMES) {
    const at = picks[role] === undefined ? -1 : ids.indexOf(picks[role]);
    if (at >= 0) choice[role] = at;
  }
  return choice;
}

export function picksFromChoice(ids: string[], choice: RoleChoice): RolePicks {
  const picks: RolePicks = {};
  for (const role of ROLE_NAMES) {
    const id = ids[choice[role] ?? -1];
    if (id !== undefined) picks[role] = id;
  }
  return picks;
}

const sameColor = (a: RGB, b: RGB) => a.r === b.r && a.g === b.g && a.b === b.b;

/**
 * The suggested roles with the user's picks laid over them. Picks outside the
 * palette (it can shrink under a recolor) fall back to the suggestion.
 */
export function resolveRoles(palette: RGB[], choice: RoleChoice) {
  const suggestion = suggestRoles(palette);
  if (!suggestion) return null;
  const find = (color: RGB) =>
    Math.max(
      0,
      palette.findIndex((c) => sameColor(c, color)),
    );
  const suggested: Record<RoleName, number> = {
    surface: find(suggestion.background),
    text: find(suggestion.foreground),
    accent: find(suggestion.accent),
  };
  const indices = { ...suggested };
  for (const role of ROLE_NAMES) {
    const pick = choice[role];
    if (pick !== undefined && pick >= 0 && pick < palette.length)
      indices[role] = pick;
  }
  const surface = palette[indices.surface];
  const text = palette[indices.text];
  const accent = palette[indices.accent];
  return {
    surface,
    text,
    accent,
    indices,
    textRatio: contrastRatio(text, surface),
    accentRatio: contrastRatio(accent, surface),
    // The best pairing the palette offers, whatever the user picked.
    bestRatio: suggestion.ratio,
    changed: ROLE_NAMES.some(
      (role) => !sameColor(palette[indices[role]], palette[suggested[role]]),
    ),
  };
}
