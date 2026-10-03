const WIDTH = 512;
const HEIGHT = 120;
const BIN = WIDTH / 256;

interface HistogramProps {
  counts: Uint32Array;
  /**
   * Where the solid line falls, on the bar scale (bar v spans v to v + 1).
   * Bars left of it take the low color, the rest the high color.
   */
  line: number;
  /** Values with no pixels between the sides, as [first, last], when any. */
  gap?: [number, number] | null;
  /** A second, dashed line, such as the median. */
  mark?: number | null;
  /** CSS for the strip under the bars that shows what the axis looks like. */
  gradient?: string;
  /** What the picture says, for people who cannot see it. */
  label: string;
  name: string;
}

/**
 * Pixel counts along one color axis, 256 bars. Lines are drawn in SVG with a
 * fixed stroke width and no text, so nothing shrinks on a narrow screen;
 * the labels live in the HTML around it.
 */
export function Histogram({
  counts,
  line,
  gap,
  mark,
  gradient,
  label,
  name,
}: HistogramProps) {
  let peak = 1;
  for (const count of counts) if (count > peak) peak = count;
  let low = "";
  let high = "";
  for (let v = 0; v < 256; v++) {
    if (!counts[v]) continue;
    const top = HEIGHT - 2 - (counts[v] / peak) * (HEIGHT - 6);
    const bar = `M${v * BIN},${HEIGHT}V${top.toFixed(1)}h${BIN}V${HEIGHT}Z`;
    if (v + 0.5 < line) low += bar;
    else high += bar;
  }
  return (
    <div className="how-histogram" data-histogram={name}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        {gap && (
          <rect
            className="how-gap"
            x={(gap[0] + 1) * BIN}
            width={Math.max(0, gap[1] - gap[0] - 1) * BIN}
            y={0}
            height={HEIGHT}
          />
        )}
        <path className="how-bars-low" d={low} />
        <path className="how-bars-high" d={high} />
        {mark != null && (
          <line
            className="how-mark"
            x1={mark * BIN}
            x2={mark * BIN}
            y1={0}
            y2={HEIGHT}
          />
        )}
        <line
          className="how-cut"
          x1={line * BIN}
          x2={line * BIN}
          y1={0}
          y2={HEIGHT}
        />
      </svg>
      {gradient && (
        <div
          className="how-axis-strip"
          style={{ background: gradient }}
          aria-hidden="true"
        />
      )}
      <div className="how-axis-ends" aria-hidden="true">
        <span>0</span>
        <span>255</span>
      </div>
    </div>
  );
}
