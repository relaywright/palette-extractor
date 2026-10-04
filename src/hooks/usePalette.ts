import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type RGB, type SortMode, rgbToHex, sortPalette } from "../lib/color";
import { extractPaletteDetailed, type ExtractionDetail } from "../lib/extract";
import { type Lock, locksFor, newPinId, toggleLocked } from "../lib/locks";
import { SAME_COLOR_DISTANCE } from "../lib/compare";
import { withoutBoxes } from "../lib/stageGroups";
import { updatePaletteFavicon } from "../lib/favicon";
import {
  oklabDistance,
  type ColorSpace,
  type WeightedColor,
} from "@relaywright/median-cut";
import type { Source } from "./useImageSource";

const HIGHLIGHT_DURATION_MS = 1500;
export type PinOutcome = "pinned" | "already" | "full" | "busy";
const MAX_COLORS = 10;

/** A palette color; a pinned one names the pin that holds it. */
export interface PaletteColor extends WeightedColor {
  lockId?: string;
}
type PaletteDetail = Omit<ExtractionDetail, "colors"> & {
  colors: PaletteColor[];
};

const pinned = (locks: Lock[]): PaletteColor[] =>
  locks.map(({ id, color }) => ({ color, population: 0, lockId: id }));

interface UsePaletteOptions {
  source: Source | null;
  urlBusy: boolean;
  /** The camera is feeding frames, so the chosen source stays untouched. */
  live?: boolean;
  initialColors: RGB[] | null;
  setLoaded: (source: Source) => void;
  setError: (message: string | null) => void;
  setNotice: (message: string) => void;
}

/**
 * Owns the extracted palette: running the quantizer worker against the
 * current source, pinning colors, choosing how many to keep, and sorting.
 */
export function usePalette({
  source,
  urlBusy,
  live = false,
  initialColors,
  setLoaded,
  setError,
  setNotice,
}: UsePaletteOptions) {
  const [locks, setLocks] = useState<Lock[]>(() =>
    locksFor(initialColors ?? []),
  );
  const [detail, setDetail] = useState<PaletteDetail>(() => ({
    colors: locks.map(({ id, color }) => ({
      color,
      population: 1,
      lockId: id,
    })),
    pixels: [],
    steps: [],
    samples: null,
  }));
  // Extraction and the stage read the pinned colors alone.
  const locked = useMemo(() => locks.map((lock) => lock.color), [locks]);
  const [count, setCount] = useState(initialColors?.length ?? 6);
  const [sort, setSort] = useState<SortMode>("original");
  const [extracting, setExtracting] = useState(!initialColors);
  const [colorSpace, setColorSpace] = useState<ColorSpace>("rgb");
  // The space that produced the palette on screen. It trails `colorSpace`
  // while a switch is re-extracting, so views of the current result (the
  // pixel cube) never pair old split boxes with the new space.
  const [detailColorSpace, setDetailColorSpace] = useState<ColorSpace>("rgb");
  const [changedHexes, setChangedHexes] = useState<Set<string>>(new Set());
  const previousColorSpace = useRef<ColorSpace>("rgb");
  const previousUnlocked = useRef<RGB[]>([]);
  const highlightTimeout = useRef<number>();

  useEffect(() => {
    if (!source || live) return;
    const controller = new AbortController();
    setExtracting(true);
    const remaining = count - locked.length;
    const isSwitch = previousColorSpace.current !== colorSpace;
    const priorUnlocked = previousUnlocked.current;
    const run = async () => {
      // Validate each new source even when every output slot is pinned.
      const next = await extractPaletteDetailed(
        source.src,
        Math.max(1, remaining),
        locked,
        controller.signal,
        colorSpace,
      );
      if (controller.signal.aborted) return;
      const unlocked =
        remaining > 0
          ? next.colors
              .filter(
                (e) => !locked.some((c) => rgbToHex(c) === rgbToHex(e.color)),
              )
              .slice(0, remaining)
          : [];
      // Deprioritized: lets the browser paint whatever's already on screen
      // (the source image, in particular) before committing this update.
      startTransition(() => {
        setDetail({
          ...next,
          colors: [...pinned(locks), ...unlocked],
          ...(remaining <= 0
            ? {
                pixels: [],
                steps: [],
                samples: next.samples && withoutBoxes(next.samples),
              }
            : {}),
        });
        setDetailColorSpace(colorSpace);
        setLoaded(source);
        setError(null);
        if (isSwitch) {
          const changed = new Set(
            unlocked
              .filter(
                ({ color }) =>
                  !priorUnlocked.some(
                    (prior) =>
                      oklabDistance(color, prior) < SAME_COLOR_DISTANCE,
                  ),
              )
              .map(({ color }) => rgbToHex(color)),
          );
          setChangedHexes(changed);
          window.clearTimeout(highlightTimeout.current);
          highlightTimeout.current = window.setTimeout(
            () => setChangedHexes(new Set()),
            HIGHLIGHT_DURATION_MS,
          );
          const total = locked.length + unlocked.length;
          const label = colorSpace === "oklab" ? "Perceptual" : "RGB";
          setNotice(
            changed.size === 0
              ? "Same colors in both color spaces."
              : `${label} changed ${changed.size} of ${total} colors.`,
          );
        } else {
          setChangedHexes(new Set());
          setNotice(
            `${locked.length + unlocked.length} colors ready from ${source.name}.`,
          );
        }
        setExtracting(false);
      });
      previousColorSpace.current = colorSpace;
      previousUnlocked.current = unlocked.map((e) => e.color);
    };
    void run().catch((err: Error) => {
      if (!controller.signal.aborted) {
        setError(`${err.message} Your last palette is still available.`);
        setExtracting(false);
      }
    });
    return () => controller.abort();
  }, [source, count, locks, colorSpace, live]);

  useEffect(() => () => window.clearTimeout(highlightTimeout.current), []);

  const sorted = useMemo(
    () => sortPalette(detail.colors, sort),
    [detail.colors, sort],
  );
  const colors = useMemo(() => sorted.map((e) => e.color), [sorted]);
  const total = sorted.reduce((sum, e) => sum + e.population, 0);
  const busy = extracting || urlBusy;

  useEffect(() => {
    updatePaletteFavicon(colors);
  }, [colors]);

  // A pin made on a swatch takes the swatch's id, which the rebuilt palette
  // uses to keep the pin on that swatch and not on another of the same color.
  const toggleLock = useCallback(
    (id: string, color: RGB) => {
      if (busy || !source) return;
      setLocks((prev) => toggleLocked(prev, id, color));
    },
    [busy, source],
  );

  // Pins a color picked from the photo. Pinned colors count
  // toward the palette size, so when every slot is already pinned the
  // palette grows by one, up to the limit.
  const pinColor = useCallback(
    (color: RGB): PinOutcome => {
      if (busy || !source) return "busy";
      const hex = rgbToHex(color);
      if (locked.some((c) => rgbToHex(c) === hex)) return "already";
      if (locked.length >= MAX_COLORS) return "full";
      if (locked.length >= count) setCount(locked.length + 1);
      setLocks([...locks, { id: newPinId(), color }]);
      return "pinned";
    },
    [busy, source, locks, locked, count],
  );

  const bumpMinCount = useCallback(() => setCount((v) => Math.max(4, v)), []);

  const loadShared = useCallback((colors: RGB[]) => {
    const pins = locksFor(colors);
    setDetail({
      colors: pins.map(({ id, color }) => ({
        color,
        population: 1,
        lockId: id,
      })),
      pixels: [],
      steps: [],
      samples: null,
    });
    setLocks(pins);
    setCount(colors.length);
    setExtracting(false);
    setColorSpace("rgb");
    setDetailColorSpace("rgb");
    setChangedHexes(new Set());
    previousColorSpace.current = "rgb";
    previousUnlocked.current = [];
  }, []);

  // A camera frame replaces the palette in place. The photo is unchanged, so
  // the swatches melt to the new colors, and a frame that looks the same as
  // the last one is dropped so a steady scene stays still.
  const applyLive = useCallback(
    (next: ExtractionDetail) => {
      const remaining = count - locked.length;
      const unlocked = remaining > 0 ? next.colors.slice(0, remaining) : [];
      const steady = (entries: { color: RGB }[]) =>
        entries.length === unlocked.length &&
        entries.every(
          ({ color }, i) => oklabDistance(color, unlocked[i].color) < 0.015,
        );
      startTransition(() => {
        setDetail((prev) => {
          const shown = prev.colors.slice(locked.length);
          if (prev.samples === null && steady(shown)) return prev;
          return {
            colors: [...pinned(locks), ...unlocked],
            pixels: [],
            steps: [],
            samples: null,
          };
        });
        setDetailColorSpace(colorSpace);
        setExtracting(false);
      });
    },
    [count, locks, locked, colorSpace],
  );

  return {
    detail,
    applyLive,
    locked,
    locks,
    setLocks,
    count,
    setCount,
    sort,
    setSort,
    busy,
    sorted,
    colors,
    total,
    toggleLock,
    pinColor,
    bumpMinCount,
    loadShared,
    colorSpace,
    setColorSpace,
    detailColorSpace,
    changedHexes,
  };
}
