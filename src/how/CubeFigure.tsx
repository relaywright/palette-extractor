import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ColorSpace } from "@relaywright/median-cut";
import type { StageSamples } from "../lib/extraction";
import { create as createGL } from "../stage/renderer";
import { create as create2D } from "../stage/painter2d";
import { sampleCube, type Renderer } from "../stage/data";
import { fitView, type ViewFit } from "../stage/math";
import { cloudAtRest, FALLBACK_POINTS } from "../stage/trace";

/** Where an overlay draws: the same frame and fit as the points beneath. */
export interface OverlayView {
  fit: ViewFit;
  angle: number;
  width: number;
  height: number;
  dpr: number;
}

export type DrawOverlay = (
  canvas: HTMLCanvasElement,
  view: OverlayView,
) => void;

/** The angle the cube first shows, as in the app's still frames. */
export const START_ANGLE = Math.PI / 4;

const TURN = Math.PI * 2;
// A drag across the whole figure turns the cube half way round.
const DRAG_TURN = Math.PI;

interface CubeFigureProps {
  samples: StageSamples;
  space: ColorSpace;
  angle: number;
  onAngle(angle: number): void;
  /** Describes the picture for people who cannot see it. */
  label: string;
  /** Draws over the points, such as split boxes. Keep it stable between renders. */
  overlay?: DrawOverlay;
  /** Names the figure for tests and styles. */
  name: string;
}

/**
 * The photo's pixels as a point cloud in a color cube, drawn by the app's
 * stage renderer (the 2D painter where WebGL is unavailable). Dragging turns
 * it; a range input beside it does the same from the keyboard. Frames draw
 * when something changes, never on a timer, so the view costs nothing at
 * rest and reduced motion needs no special case.
 */
export function CubeFigure({
  samples,
  space,
  angle,
  onAngle,
  label,
  overlay,
  name,
}: CubeFigureProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const fallback = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [mounted, setMounted] = useState(0);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"webgl" | "2d">("webgl");
  const drag = useRef<{ x: number; angle: number } | null>(null);

  const fit = useMemo(
    () => fitView(sampleCube(samples, space), samples.extent),
    [samples, space],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.setAttribute("aria-hidden", "true");
    overlayRef.current = overlayCanvas;
    let disposed = false;
    let points: HTMLCanvasElement;

    const mount = () => {
      points = document.createElement("canvas");
      points.setAttribute("role", "img");
      points.setAttribute("aria-label", label);
      let next = fallback.current ? null : createGL(points);
      if (!next) {
        fallback.current = true;
        points = document.createElement("canvas");
        points.setAttribute("role", "img");
        points.setAttribute("aria-label", label);
        next = create2D(points);
      }
      rendererRef.current = next;
      setMode(fallback.current ? "2d" : "webgl");
      host.replaceChildren(points, overlayCanvas);
      const { width, height, dpr } = sizeRef.current;
      if (width) next.resize(width, height, dpr);
      next.onContextLost(() => {
        if (disposed) return;
        next.dispose();
        fallback.current = true;
        setReady(false);
        mount();
      });
      setMounted((n) => n + 1);
    };
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width, height, dpr };
      rendererRef.current?.resize(width, height, dpr);
      setSize({ width, height });
    };

    mount();
    const sizing = new ResizeObserver(resize);
    sizing.observe(host);
    resize();
    return () => {
      disposed = true;
      sizing.disconnect();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      // Release the context now rather than whenever the canvas is collected.
      points
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
      host.replaceChildren();
    };
    // The label is read when a canvas is made; the effect below keeps it current.
  }, []);

  useLayoutEffect(() => {
    hostRef.current?.querySelector("canvas")?.setAttribute("aria-label", label);
  }, [label, mounted]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    let current = true;
    setReady(false);
    void renderer.setSamples(samples, space, fit).then(() => {
      if (current) setReady(true);
    });
    return () => {
      current = false;
    };
  }, [samples, space, fit, mounted]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const canvas = overlayRef.current;
    if (!renderer || !canvas || !ready || !size.width) return;
    const { width, height, dpr } = sizeRef.current;
    renderer.draw(
      cloudAtRest({
        stepIndex: 0,
        angle,
        points: Math.min(
          samples.groups.length,
          fallback.current ? FALLBACK_POINTS : Infinity,
        ),
      }),
    );
    if (overlay) overlay(canvas, { fit, angle, width, height, dpr });
    else canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, [ready, angle, size, samples, fit, overlay, mounted]);

  const turnTo = (event: React.PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    const width = hostRef.current?.getBoundingClientRect().width || 1;
    const next = start.angle + ((event.clientX - start.x) / width) * DRAG_TURN;
    onAngle(((next % TURN) + TURN) % TURN);
  };

  return (
    <div
      ref={hostRef}
      className="how-cube"
      data-cube={name}
      data-cube-mode={mode}
      data-cube-ready={ready}
      data-cube-angle={Math.round((angle * 180) / Math.PI)}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, angle };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={turnTo}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
}

interface RotateControlProps {
  angle: number;
  onAngle(angle: number): void;
}

/** The keyboard and screen reader way to turn a cube: one range input. */
export function RotateControl({ angle, onAngle }: RotateControlProps) {
  const degrees = Math.round((angle * 180) / Math.PI) % 360;
  return (
    <label className="how-slider">
      <span>Rotate</span>
      <input
        type="range"
        min={0}
        max={355}
        step={5}
        value={Math.round(degrees / 5) * 5}
        aria-valuetext={`${degrees} degrees`}
        onChange={(event) =>
          onAngle((Number(event.target.value) * Math.PI) / 180)
        }
      />
    </label>
  );
}
