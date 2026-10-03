import { useMemo, useState } from "react";
import { type RGB, rgbToHex } from "../lib/color";
import {
  EXPORT_LABELS,
  SHADE_FORMATS,
  exportPalette,
  type ExportFormat,
} from "../lib/exporters";
import { downloadBlob } from "../lib/paletteCard";
import { shadeScale } from "../lib/scales";
import { Icon } from "./Icon";
import { ShadeScales } from "./ShadeScales";
import "./knowledge.css";

type View = "code" | "shades";

export function ExportPanel({
  palette,
  format,
  onFormatChange,
  onCopy,
  copied,
}: {
  palette: RGB[];
  format: ExportFormat;
  onFormatChange: (v: ExportFormat) => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const [view, setView] = useState<View>("code");
  const [includeShades, setIncludeShades] = useState(false);
  const canShade = SHADE_FORMATS.includes(format);
  const scales = useMemo(
    () => (includeShades && canShade ? palette.map(shadeScale) : undefined),
    [palette, includeShades, canShade],
  );
  const code = exportPalette(palette, format, { shades: scales });
  const extensions = {
    css: "css",
    tailwind: "css",
    scss: "scss",
    svg: "svg",
    json: "json",
  };
  const download = () =>
    downloadBlob(
      new Blob([code], {
        type:
          format === "svg"
            ? "image/svg+xml"
            : format === "json"
              ? "application/json"
              : "text/plain",
      }),
      `palette.${extensions[format]}`,
    );
  return (
    <section className="export-panel" aria-label="Export palette">
      <div className="panel-intro">
        <h2>Paste-ready in {Object.keys(EXPORT_LABELS).length} formats.</h2>
        <p>
          Copy the values, download a file, or take a palette card with you. No
          cleanup required.
        </p>
        <fieldset className="colorspace-switch knowledge-switch">
          <legend className="sr-only">Export view</legend>
          <span className="colorspace-options">
            {(
              [
                ["code", "Code"],
                ["shades", "Shades"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={view === value ? "active" : ""}>
                <input
                  type="radio"
                  name="export-view"
                  checked={view === value}
                  onChange={() => setView(value)}
                />
                {label}
              </label>
            ))}
          </span>
        </fieldset>
        {view === "code" && (
          <>
            <label className="export-select">
              Export format
              <select
                aria-label="Export format"
                value={format}
                onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
              >
                {Object.entries(EXPORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="knowledge-check">
              <input
                type="checkbox"
                checked={includeShades && canShade}
                disabled={!canShade}
                onChange={(e) => setIncludeShades(e.target.checked)}
              />
              Include shades
              <small>
                {canShade
                  ? "Adds a 50 to 950 scale for each color."
                  : "Not available for SVG."}
              </small>
            </label>
            <div className="button-row">
              <button className="button primary" onClick={() => onCopy(code)}>
                <Icon name={copied ? "check" : "copy"} />
                {copied ? "Copied" : "Copy code"}
              </button>
              <button className="button secondary" onClick={download}>
                <Icon name="download" /> Download
              </button>
            </div>
          </>
        )}
      </div>
      {view === "shades" ? (
        <ShadeScales palette={palette} />
      ) : (
        <div className="code-window">
          <div className="code-heading">
            <span className="code-chips" aria-hidden="true">
              {palette.map((color, i) => (
                <i key={i} style={{ background: rgbToHex(color) }} />
              ))}
            </span>
            <code>palette.{extensions[format]}</code>
            <span>{EXPORT_LABELS[format]}</span>
          </div>
          <pre
            tabIndex={0}
            aria-label={`${EXPORT_LABELS[format]} export preview`}
          >
            <code>{code}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
