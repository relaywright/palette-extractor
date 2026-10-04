import { useEffect, useState, type RefObject } from "react";

/** What the photo layers need to place themselves over the photo. */
export interface Fit {
  /** The photo's box on the page, in CSS pixels. */
  box: { width: number; height: number };
  /** The photo at its own size, which the page crops with `object-fit: cover`. */
  natural: { width: number; height: number };
}

/**
 * Tracks the photo's box and natural size, so layers over it follow a resize
 * or a new photo. Before the photo has loaded its natural size is the working
 * raster's.
 */
export function useFit(
  hero: RefObject<HTMLImageElement>,
  working: { width: number; height: number },
): Fit {
  const read = (): Fit => {
    const image = hero.current;
    const loaded = !!image?.complete && image.naturalWidth > 0;
    return {
      box: {
        width: image?.clientWidth ?? 0,
        height: image?.clientHeight ?? 0,
      },
      natural: loaded
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : working,
    };
  };
  const [fit, setFit] = useState(read);

  useEffect(() => {
    const image = hero.current;
    if (!image) return;
    const update = () =>
      setFit((previous) => {
        const next = read();
        return previous.box.width === next.box.width &&
          previous.box.height === next.box.height &&
          previous.natural.width === next.natural.width &&
          previous.natural.height === next.natural.height
          ? previous
          : next;
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(image);
    image.addEventListener("load", update);
    return () => {
      observer.disconnect();
      image.removeEventListener("load", update);
    };
  }, [hero, working.width, working.height]);

  return fit;
}
