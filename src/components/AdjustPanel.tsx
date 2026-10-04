import { useEffect, useRef } from "react";
import type { RGB } from "../lib/color";
import type { PaletteEdit } from "../hooks/usePaletteEdits";
import { MAX_CHROMA, makeEdit, valueOf } from "../recolor/nudge";
import "./recolor.css";

/** Matches the stylesheet's docked layout. */
const DOCKED = "(max-width: 580px), (max-width: 759px) and (min-height: 600px)";

export function AdjustPanel({
  name,
  original,
  edit,
  onChange,
  onClose,
}: {
  name: string;
  original: RGB;
  edit: PaletteEdit | null;
  onChange: (next: PaletteEdit | null) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const value = valueOf(original, edit);
  // In a single-column layout the panel docks at the bottom of the screen
  // (above the tab bar on phones). The stylesheet reads its height to keep
  // the page, notices and the color-vision badge clear of it, and the page
  // scrolls the photo into the space above them unless it already fits.
  useEffect(() => {
    const root = document.documentElement;
    const el = panel.current!;
    const measure = () =>
      root.style.setProperty("--adjust-dock", `${el.offsetHeight}px`);
    root.dataset.adjusting = "";
    measure();
    const sizing = new ResizeObserver(measure);
    sizing.observe(el);
    const frame = document.querySelector(".source-frame");
    if (frame && matchMedia(DOCKED).matches) {
      const { top, bottom } = frame.getBoundingClientRect();
      const badge = document.querySelector(".cvd-indicator");
      const clear = Math.min(
        el.getBoundingClientRect().top,
        badge ? badge.getBoundingClientRect().top : Infinity,
      );
      if (top < 0 || bottom > clear)
        frame.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
    }
    return () => {
      sizing.disconnect();
      delete root.dataset.adjusting;
      root.style.removeProperty("--adjust-dock");
    };
  }, []);
  // Back on the swatch, so keyboard focus is not left on a closed panel.
  const close = () => {
    onClose();
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".swatch.selected .adjust-button")
        ?.focus(),
    );
  };
  const change = (next: typeof value) => onChange(makeEdit(next));
  const rows = [
    {
      id: "adjust-lightness",
      label: "Lightness",
      min: 0,
      max: 100,
      step: 1,
      now: Math.round(value.L * 100),
      text: `${Math.round(value.L * 100)}%`,
      set: (n: number) => change({ ...value, L: n / 100 }),
    },
    {
      id: "adjust-chroma",
      label: "Chroma",
      min: 0,
      max: MAX_CHROMA,
      step: 0.005,
      now: Math.min(MAX_CHROMA, value.C),
      text: value.C.toFixed(2),
      set: (n: number) => change({ ...value, C: n }),
    },
    {
      id: "adjust-hue",
      label: "Hue",
      min: 0,
      max: 360,
      step: 1,
      now: Math.round(value.h) % 361,
      text: `${Math.round(value.h)}°`,
      set: (n: number) => change({ ...value, h: n }),
    },
  ];
  return (
    <section
      ref={panel}
      id="adjust-panel"
      className="adjust-panel"
      aria-label={`Adjust ${name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="adjust-head">
        <h3>Adjust {name}</h3>
        <div>
          <button
            className="text-button"
            onClick={() => onChange(null)}
            disabled={!edit}
          >
            Undo this color
          </button>
          <button className="text-button" onClick={close}>
            Close
          </button>
        </div>
      </div>
      <div className="adjust-rows">
        {rows.map((row) => (
          <Row key={row.id} {...row} focus={row.id === "adjust-lightness"} />
        ))}
      </div>
      <p className="adjust-keys">
        On a swatch, Shift with arrow keys moves lightness (up, down) and hue
        (left, right). Shift with Page Up or Page Down moves chroma. Shift with
        Home undoes the color.
      </p>
    </section>
  );
}

function Row({
  id,
  label,
  min,
  max,
  step,
  now,
  text,
  set,
  focus,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  now: number;
  text: string;
  set: (n: number) => void;
  focus?: boolean;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={now}
        aria-valuetext={text}
        autoFocus={focus}
        onChange={(e) => set(Number(e.target.value))}
      />
      <output htmlFor={id}>{text}</output>
    </>
  );
}
