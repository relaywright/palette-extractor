import { useEffect, useMemo, useRef, useState } from "react";
import { type RGB, rgbToHex, labelColorFor } from "../lib/color";
import { APCA_BODY_MIN, apcaContrast } from "../lib/apca";
import { type ContrastPair, formatRatio, readablePairs } from "../lib/contrast";
import { CVD_TYPES, confusablePairs } from "../lib/cvd";
import { paletteColorNames } from "../lib/names";
import { copyText } from "../lib/clipboard";
import { type CvdMode, setCvd, useCvd } from "./CvdFilters";
import "./knowledge.css";

const CVD_OPTIONS: [CvdMode, string][] = [
  ["none", "None"],
  ...CVD_TYPES.map((type): [CvdMode, string] => [
    type,
    type[0].toUpperCase() + type.slice(1),
  ]),
];

/** A plain note when WCAG 2 and APCA disagree about body text, else null. */
function disagreement(pair: ContrastPair, lc: number): string | null {
  const wcagBody = pair.level === "AAA" || pair.level === "AA";
  const apcaBody = Math.abs(lc) >= APCA_BODY_MIN;
  if (wcagBody && !apcaBody)
    return `Meets WCAG 2 for body text, but APCA rates it Lc ${Math.round(lc)}, under the ${APCA_BODY_MIN} usually wanted for body text. Better for large or bold text.`;
  if (!wcagBody && apcaBody)
    return `Misses WCAG 2 for body text, but APCA rates it Lc ${Math.round(lc)}, enough for body text.`;
  return null;
}

export function ContrastPanel({ palette }: { palette: RGB[] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number>();
  const cvd = useCvd();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pairs = readablePairs(palette);
  const names = useMemo(() => paletteColorNames(palette), [palette]);
  const confusable = useMemo(
    () => (cvd === "none" ? [] : confusablePairs(palette, cvd)),
    [palette, cvd],
  );
  const handleCopy = async (index: number, fg: string, bg: string) => {
    if (!(await copyText(`color: ${fg};\nbackground-color: ${bg};`))) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setCopiedIndex(index);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedIndex(null), 1600);
  };
  return (
    <section className="contrast-panel" aria-label="Readable color pairs">
      <div className="contrast-heading">
        <div>
          <h2>Make it readable.</h2>
          <p>
            Real contrast ratios between your colors, strongest first. Select a
            pairing to copy its text and background as CSS.
          </p>
        </div>
        <div className="contrast-legend">
          <span>AAA ≥ 7:1</span>
          <span>AA ≥ 4.5:1</span>
          <span>Large text ≥ 3:1</span>
        </div>
      </div>
      <div className="cvd-control">
        <fieldset className="colorspace-switch knowledge-switch">
          <legend className="sr-only">Color vision preview</legend>
          <span className="knowledge-switch-label" aria-hidden="true">
            Color vision preview
          </span>
          <span className="colorspace-options">
            {CVD_OPTIONS.map(([value, label]) => (
              <label key={value} className={cvd === value ? "active" : ""}>
                <input
                  type="radio"
                  name="cvd-mode"
                  checked={cvd === value}
                  onChange={() => setCvd(value)}
                />
                {label}
              </label>
            ))}
          </span>
        </fieldset>
        <p className="cvd-help">
          Shows the photo, swatches and mockup the way this type of color
          blindness sees them.
        </p>
        <div className="cvd-result" aria-live="polite">
          {cvd !== "none" &&
            (confusable.length ? (
              <>
                <p>Under {cvd}, these colors look almost the same:</p>
                <ul>
                  {confusable.slice(0, 6).map(({ a, b }) => (
                    <li key={`${a}-${b}`}>
                      {names[a]} ({rgbToHex(palette[a])}) and {names[b]} (
                      {rgbToHex(palette[b])})
                    </li>
                  ))}
                </ul>
                {confusable.length > 6 && (
                  <p>And {confusable.length - 6} more pairs.</p>
                )}
              </>
            ) : (
              <p>Under {cvd}, every pair of your colors stays distinct.</p>
            ))}
        </div>
      </div>
      {failed && (
        <p role="alert">
          Clipboard unavailable. Use Export palette to select and copy the
          values.
        </p>
      )}
      {!pairs.length ? (
        <div className="contrast-empty">
          These colors are too close in brightness for readable text together.
          Try a different image or include more colors. A beautiful palette can
          still need a separate light or dark text color.
        </div>
      ) : (
        <ul className="contrast-grid">
          {pairs.map((pair, i) => {
            const fg = rgbToHex(pair.fg),
              bg = rgbToHex(pair.bg);
            const lc = apcaContrast(pair.fg, pair.bg);
            const note = disagreement(pair, lc);
            return (
              <li key={`${fg}-${bg}`}>
                <button
                  className="contrast-pair"
                  onClick={() => void handleCopy(i, fg, bg)}
                  aria-label={`Copy CSS for ${fg} text on ${bg}, contrast ${formatRatio(pair.ratio)} to 1, ${pair.level}, APCA Lc ${Math.round(lc)}`}
                >
                  <span
                    className="contrast-sample"
                    style={{ background: bg, color: fg }}
                  >
                    <span>Aa</span>
                    <span style={{ color: labelColorFor(pair.bg) }}>
                      <span className="contrast-ratio">
                        {formatRatio(pair.ratio)}:1
                      </span>
                      <span className="contrast-verdict">
                        {pair.level === "AA Large"
                          ? "Large text only"
                          : pair.level}
                      </span>
                    </span>
                  </span>
                  <span className="contrast-meta">
                    <code aria-live="polite">
                      {copiedIndex === i ? "Copied CSS!" : `${fg} / ${bg}`}
                    </code>
                  </span>
                </button>
                <p className="apca-line">
                  <span>Lc {Math.round(lc)}</span>
                  <span>APCA, WCAG 3 draft</span>
                </p>
                {note && <p className="apca-note">{note}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="palette-hint">
        WCAG 2 contrast for text. Large text means at least 24px regular or
        about 19px bold. APCA is a draft method for WCAG 3 that also weighs
        which color is the text. This checks color pairs, not an entire design.
      </p>
    </section>
  );
}
