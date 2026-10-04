import type { RGB } from "./color";

// APCA-W3 0.0.98G-4g (SAPC-8, G-4g constants), as published at
// https://github.com/Myndex/apca-w3. APCA is a WCAG 3 draft method: the
// result is a signed lightness contrast (Lc), positive for dark text on a
// light background and negative for light text on a dark one.
const MAIN_TRC = 2.4;
const [R_CO, G_CO, B_CO] = [0.2126729, 0.7151522, 0.072175];
const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;
const BLK_THRS = 0.022;
const BLK_CLMP = 1.414;
const SCALE = 1.14;
const OFFSET = 0.027;
const DELTA_Y_MIN = 0.0005;
const LO_CLIP = 0.1;

function screenLuminance({ r, g, b }: RGB): number {
  const y =
    (r / 255) ** MAIN_TRC * R_CO +
    (g / 255) ** MAIN_TRC * G_CO +
    (b / 255) ** MAIN_TRC * B_CO;
  // Soft clamp near black, where screens leak light.
  return y > BLK_THRS ? y : y + (BLK_THRS - y) ** BLK_CLMP;
}

/** APCA Lc of `text` drawn on `background`, unrounded. */
export function apcaContrast(text: RGB, background: RGB): number {
  const yText = screenLuminance(text);
  const yBg = screenLuminance(background);
  if (Math.abs(yBg - yText) < DELTA_Y_MIN) return 0;
  if (yBg > yText) {
    const sapc = (yBg ** NORM_BG - yText ** NORM_TXT) * SCALE;
    return sapc < LO_CLIP ? 0 : (sapc - OFFSET) * 100;
  }
  const sapc = (yBg ** REV_BG - yText ** REV_TXT) * SCALE;
  return sapc > -LO_CLIP ? 0 : (sapc + OFFSET) * 100;
}

/** |Lc| below this is generally too faint for body text. */
export const APCA_BODY_MIN = 60;
