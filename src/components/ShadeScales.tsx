import { useEffect, useMemo, useRef, useState } from "react";
import { type RGB, rgbToHex } from "../lib/color";
import { copyText } from "../lib/clipboard";
import { paletteColorNames } from "../lib/names";
import { type Shade, shadeScale } from "../lib/scales";
import "./knowledge.css";

type ValueKind = "hex" | "p3";

const CURVE = { width: 220, height: 64, padX: 8, padY: 8 };

/** Lightness by stop, drawn by hand: one dot per stop in its own color. */
function LightnessCurve({ shades, name }: { shades: Shade[]; name: string }) {
  const { width, height, padX, padY } = CURVE;
  const x = (i: number) =>
    padX + (i / (shades.length - 1)) * (width - 2 * padX);
  const y = (lightness: number) => padY + (1 - lightness) * (height - 2 * padY);
  const points = shades.map((s, i) => `${x(i)},${y(s.lightness)}`).join(" ");
  const percent = (s: Shade) => Math.round(s.lightness * 100);
  const first = shades[0];
  const last = shades[shades.length - 1];
  return (
    <svg
      className="shade-curve"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Lightness curve for ${name}: ${percent(first)} percent at ${first.stop}, falling to ${percent(last)} percent at ${last.stop}`}
    >
      <line
        className="shade-curve-mid"
        x1={padX}
        x2={width - padX}
        y1={y(0.5)}
        y2={y(0.5)}
      />
      <polyline className="shade-curve-line" points={points} fill="none" />
      {shades.map((s, i) => (
        <circle
          key={s.stop}
          cx={x(i)}
          cy={y(s.lightness)}
          r={s.anchor ? 4.5 : 3.5}
          fill={s.hex}
          className={s.anchor ? "shade-curve-dot is-anchor" : "shade-curve-dot"}
        />
      ))}
    </svg>
  );
}

export function ShadeScales({ palette }: { palette: RGB[] }) {
  const [kind, setKind] = useState<ValueKind>("hex");
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const scales = useMemo(() => palette.map(shadeScale), [palette]);
  const names = useMemo(() => paletteColorNames(palette), [palette]);

  const copy = async (key: string, value: string) => {
    if (!(await copyText(value))) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setCopied(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="shade-scales">
      <fieldset className="colorspace-switch knowledge-switch">
        <legend className="sr-only">Shade value format</legend>
        <span className="colorspace-options">
          {(
            [
              ["hex", "Hex"],
              ["p3", "Display P3"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={kind === value ? "active" : ""}>
              <input
                type="radio"
                name="shade-kind"
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {label}
            </label>
          ))}
        </span>
      </fieldset>
      {failed && (
        <p role="alert" className="shade-note">
          Clipboard unavailable. Choose Code and select the values to copy.
        </p>
      )}
      <ul className="shade-rows">
        {scales.map((scale, row) => (
          <li key={row} className="shade-row" data-testid="shade-row">
            <div className="shade-head">
              <h3>{names[row]}</h3>
              <code>{rgbToHex(palette[row])}</code>
            </div>
            <ul className="shade-chips">
              {scale.map((shade) => {
                const key = `${row}-${shade.stop}`;
                const value = kind === "hex" ? shade.hex : shade.p3;
                return (
                  <li key={shade.stop}>
                    <button
                      type="button"
                      className="shade-chip"
                      onClick={() => void copy(key, value)}
                      aria-label={`Copy ${names[row]} ${shade.stop}, ${value}${shade.anchor ? ", your color" : ""}`}
                    >
                      <i
                        style={{
                          background: kind === "hex" ? shade.hex : shade.p3,
                        }}
                      />
                      <span className="shade-stop">
                        {shade.stop}
                        {shade.anchor && " · yours"}
                      </span>
                      <code aria-live="polite">
                        {copied === key ? "Copied!" : value}
                      </code>
                    </button>
                  </li>
                );
              })}
            </ul>
            <LightnessCurve shades={scale} name={names[row]} />
          </li>
        ))}
      </ul>
      <p className="palette-hint">
        Each scale holds the color's hue and chroma and steps lightness from 50
        (lightest) to 950 (darkest). Colors outside sRGB are pulled in with CSS
        Color 4 gamut mapping.
      </p>
    </div>
  );
}
