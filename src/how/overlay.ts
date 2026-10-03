import type { ColorSpace, SplitStep } from "@relaywright/median-cut";
import { boxCorners, project, type ViewFit } from "../stage/math";
import { drawTrace, stepEdges } from "../stage/trace";
import type { OverlayView } from "./CubeFigure";
import type { SplitInfo } from "./splitMath";

/** Sizes the overlay canvas to the frame and returns its cleared 2D context. */
function prepare(canvas: HTMLCanvasElement, view: OverlayView) {
  const { width, height, dpr } = view;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function strokeEdges(
  ctx: CanvasRenderingContext2D,
  edges: [number, number, number, number][],
) {
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of edges) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

/** The boxes of a finished split, with a marker for each final color. */
export function drawFinal(
  steps: SplitStep[],
  space: ColorSpace,
): (canvas: HTMLCanvasElement, view: OverlayView) => void {
  return (canvas, { fit, angle, width, height, dpr }) =>
    drawTrace(
      canvas,
      steps,
      space,
      fit,
      { stepIndex: steps.length - 1, angle, points: 0 },
      width,
      height,
      dpr,
    );
}

/**
 * Every box before a split, the one being cut drawn bright, and a plane
 * where the cut falls. The plane sits halfway between the two sides.
 */
export function drawSplit(
  steps: SplitStep[],
  info: SplitInfo,
): (canvas: HTMLCanvasElement, view: OverlayView) => void {
  return (canvas, view) => {
    const { fit, angle, width, height } = view;
    const ctx = prepare(canvas, view);
    const before = steps[info.split - 1];
    const others = before.filter((_, i) => i !== info.boxIndex);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(218, 226, 231, 0.3)";
    strokeEdges(ctx, stepEdges(others, fit, angle, width, height));
    const plane = cutPlane(info, fit, angle, width, height);
    ctx.fillStyle = "rgba(228, 195, 151, 0.2)";
    ctx.beginPath();
    plane.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#e4c397";
    ctx.stroke();
    strokeEdges(
      ctx,
      stepEdges([before[info.boxIndex]], fit, angle, width, height),
    );
  };
}

/** The four screen corners of the cut, a rectangle across the box. */
function cutPlane(
  info: SplitInfo,
  fit: ViewFit,
  angle: number,
  width: number,
  height: number,
): [number, number][] {
  const { axis, bounds } = info;
  const at = (info.lowMax + info.highMin) / 2;
  const min = [...bounds.min] as [number, number, number];
  const max = [...bounds.max] as [number, number, number];
  min[axis] = at;
  max[axis] = at;
  const corners = boxCorners({ min, max }, fit);
  const [u, v] = [0, 1, 2].filter((k) => k !== axis);
  // Walk the rectangle's corners in order: low-low, high-low, high-high, low-high.
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([bu, bv]) =>
    project(corners[(bu << u) | (bv << v)], angle, width, height, fit),
  );
}
