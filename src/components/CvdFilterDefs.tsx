import { useLayoutEffect } from "react";
import { CVD_MATRICES, CVD_TYPES } from "../lib/cvd";
import type { CvdMode } from "./CvdFilters";
import "./knowledge.css";

/** A 3x3 color matrix as the 4x5 form feColorMatrix wants (alpha untouched). */
const feMatrix = (m: readonly number[]) =>
  [
    ...m.slice(0, 3),
    0,
    0,
    ...m.slice(3, 6),
    0,
    0,
    ...m.slice(6, 9),
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ].join(" ");

/**
 * The simulation filters and the "simulating" indicator. The attribute that
 * switches the filters on is set only once the filters exist, so a region is
 * never left pointing at a missing filter.
 */
export default function CvdFilterDefs({
  mode,
  onOff,
}: {
  mode: Exclude<CvdMode, "none">;
  onOff: () => void;
}) {
  useLayoutEffect(() => {
    document.documentElement.dataset.cvd = mode;
    return () => {
      delete document.documentElement.dataset.cvd;
    };
  }, [mode]);

  return (
    <>
      <svg
        className="cvd-defs"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {CVD_TYPES.map((type) => (
            <filter
              key={type}
              id={`cvd-${type}`}
              colorInterpolationFilters="linearRGB"
            >
              <feColorMatrix
                type="matrix"
                values={feMatrix(CVD_MATRICES[type])}
              />
            </filter>
          ))}
        </defs>
      </svg>
      <div className="cvd-indicator" role="status">
        <span>Simulating {mode}</span>
        <button type="button" onClick={onOff}>
          Turn off
        </button>
      </div>
    </>
  );
}
