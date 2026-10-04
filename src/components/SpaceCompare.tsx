import { useEffect, useMemo, useState } from "react";
import { rgbToHex, type RGB } from "../lib/color";
import { alignPalettes, changedColumns } from "../lib/compare";
import { extractPaletteDetailed } from "../lib/extract";
import type { ColorSpace } from "@relaywright/median-cut";
import "./touch.css";

/** The palette a color space produces for this photo, locked colors first. */
async function paletteIn(
  src: string,
  space: ColorSpace,
  locked: RGB[],
  count: number,
  signal: AbortSignal,
): Promise<RGB[]> {
  const remaining = count - locked.length;
  const next = await extractPaletteDetailed(
    src,
    Math.max(1, remaining),
    locked,
    signal,
    space,
  );
  const hexes = new Set(locked.map(rgbToHex));
  const free =
    remaining > 0
      ? next.colors
          .map((entry) => entry.color)
          .filter((color) => !hexes.has(rgbToHex(color)))
          .slice(0, remaining)
      : [];
  return [...locked, ...free];
}

/**
 * Both color spaces' palettes for the photo, one above the other. Colors
 * both spaces found share a column; the rest are marked.
 */
export default function SpaceCompare({
  src,
  locked,
  count,
}: {
  src: string;
  locked: RGB[];
  count: number;
}) {
  const [palettes, setPalettes] = useState<{ rgb: RGB[]; oklab: RGB[] } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPalettes(null);
    setFailed(false);
    Promise.all([
      paletteIn(src, "rgb", locked, count, controller.signal),
      paletteIn(src, "oklab", locked, count, controller.signal),
    ])
      .then(([rgb, oklab]) => setPalettes({ rgb, oklab }))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [src, locked, count]);

  const columns = useMemo(
    () => (palettes ? alignPalettes(palettes.rgb, palettes.oklab) : []),
    [palettes],
  );
  const changed = changedColumns(columns);
  const same = !!palettes && changed === 0;
  // Colors only Perceptual found: what the switch changed, as the palette's
  // own "changed" line counts it.
  const swapped = columns.filter((column) => !column.rgb).length;

  const cell = (color: RGB | null, key: number, label: string) => (
    <td
      key={key}
      data-state={color ? (same ? "same" : cellState(key)) : "empty"}
    >
      <i style={color ? { background: rgbToHex(color) } : undefined} />
      <span className="sr-only">
        {color ? rgbToHex(color) : `No match in ${label}`}
      </span>
    </td>
  );
  const cellState = (key: number) =>
    columns[key].rgb && columns[key].oklab ? "same" : "changed";
  const rows: [string, "rgb" | "oklab"][] = same
    ? [["Both", "rgb"]]
    : [
        ["RGB", "rgb"],
        ["Perceptual", "oklab"],
      ];

  return (
    <section className="space-compare" aria-label="Color space comparison">
      {failed ? (
        <p className="space-compare-note">
          Could not compare the color spaces for this photo.
        </p>
      ) : !palettes ? (
        <p className="space-compare-note">Comparing color spaces…</p>
      ) : (
        <>
          <p className="space-compare-note" role="status">
            {same
              ? "Same colors in both color spaces."
              : `Perceptual changes ${swapped} of ${palettes.oklab.length} colors.`}
          </p>
          <table className="space-compare-rows" data-columns={columns.length}>
            <caption className="sr-only">
              Palette colors found in each color space, matching colors in the
              same column
            </caption>
            <colgroup>
              <col className="space-compare-label" />
            </colgroup>
            <tbody>
              {rows.map(([label, space]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {columns.map((column, i) => cell(column[space], i, label))}
                </tr>
              ))}
            </tbody>
          </table>
          {!same && (
            <p className="space-compare-key">
              Dashed outline: found in only one space.
            </p>
          )}
        </>
      )}
    </section>
  );
}
