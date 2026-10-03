import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Analysis } from "./analysis";
import type { AnalysisClient } from "./client";

/** The photo the page is showing and everything computed from it. */
export interface PageData {
  name: string;
  img: HTMLImageElement;
  analysis: Analysis;
  /** The working image's pixels, for the figures that redraw it. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  client: AnalysisClient;
  /** Counts up with every new photo, so figures can tell they were recomputed. */
  version: number;
}

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the visitor asks for less motion. Read on the first render. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface SectionProps {
  id: string;
  number: number;
  title: string;
  /** Two to four short paragraphs. */
  children: ReactNode;
  /** The interactive figure, or null while the photo is still being read. */
  figure: ReactNode | null;
  photo?: string;
  version?: number;
}

/**
 * True once the element has come within a screen of the viewport, and
 * stays true. Figures build their first frames only then, so the page's
 * opening work is the first figure's, not all nine.
 */
function useNear(ref: React.RefObject<Element>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const watcher = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setNear(true),
      { rootMargin: "600px 0px" },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [ref, near]);
  return near;
}

export function Section({
  id,
  number,
  title,
  children,
  figure,
  photo,
  version,
}: SectionProps) {
  const frame = useRef<HTMLElement>(null);
  const near = useNear(frame);
  const shown = near ? figure : null;
  return (
    <section id={id} className="how-section" aria-labelledby={`${id}-title`}>
      <div className="how-copy">
        <p className="how-eyebrow">{number} of 9</p>
        <h2 id={`${id}-title`}>{title}</h2>
        {children}
      </div>
      <figure
        ref={frame}
        className="how-figure"
        data-figure={id}
        data-photo={photo}
        data-version={version}
        aria-busy={shown === null}
      >
        {shown ?? (
          <div className="how-skeleton" role="status">
            Reading your photo
          </div>
        )}
      </figure>
    </section>
  );
}

interface SwatchProps {
  color: string;
  /** Set when the swatch carries meaning on its own. */
  label?: string;
}

/** A small color chip. Decorative unless it has a label. */
export function Chip({ color, label }: SwatchProps) {
  return (
    <i
      className="how-chip"
      style={{ background: color }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
