import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { RGB } from "../lib/color";
import { createCpuRenderer } from "../recolor/cpu";
import { createGlRenderer } from "../recolor/gl";
import { buildModel } from "../recolor/math";
import type { LayerRenderer } from "../recolor/renderer";
import "./recolor.css";

/**
 * The photo recolored to follow the edited palette, drawn over the original
 * inside the source frame. It loads on the first edit. Without edits it
 * stays mounted but hidden, showing the photo as it is.
 */
export default function RecolorLayer({
  image,
  src,
  original,
  edited,
}: {
  image: RefObject<HTMLImageElement>;
  /** The photo's address, so a new photo gets a new renderer. */
  src: string;
  original: RGB[];
  edited: RGB[];
}) {
  const [mode, setMode] = useState<"webgl" | "cpu">("webgl");
  const [unavailable, setUnavailable] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<LayerRenderer | null>(null);
  const model = useMemo(() => buildModel(original, edited), [original, edited]);
  const latest = useRef(model);
  latest.current = model;

  useEffect(() => {
    const target = canvas.current;
    const photo = image.current;
    if (!target || !photo) return;
    let made: LayerRenderer | null = null;
    let observer: ResizeObserver | undefined;
    const start = () => {
      try {
        made =
          mode === "webgl"
            ? createGlRenderer(target, photo, () => setMode("cpu"))
            : createCpuRenderer(target, photo);
      } catch {
        made = null;
      }
      if (!made) {
        // A canvas that tried WebGL cannot give out a 2D context, so the
        // fallback gets a fresh canvas through the key below.
        if (mode === "webgl") setMode("cpu");
        else setUnavailable(true);
        return;
      }
      renderer.current = made;
      observer = new ResizeObserver(() => made?.resize());
      observer.observe(target);
      made.draw(latest.current);
    };
    // Decoding can still be under way when the first edit lands.
    if (photo.complete && photo.naturalWidth) start();
    else photo.addEventListener("load", start, { once: true });
    return () => {
      photo.removeEventListener("load", start);
      observer?.disconnect();
      made?.destroy();
      renderer.current = null;
    };
  }, [mode, image, src]);

  useEffect(() => {
    renderer.current?.draw(model);
  }, [model]);

  if (unavailable) return null;
  return (
    <canvas
      key={mode}
      ref={canvas}
      className="recolor-layer"
      data-active={model !== null}
      aria-hidden="true"
    />
  );
}
