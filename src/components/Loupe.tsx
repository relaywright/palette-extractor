import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { rgbToHex, type RGB } from "../lib/color";
import type { StageSamples } from "../lib/extraction";
import type { PinOutcome } from "../hooks/usePalette";
import { paletteColorNames } from "../lib/names";
import {
  coverFit,
  moveCursor,
  ownerGrid,
  pixelAt,
  pointOf,
  swatchOwning,
} from "../lib/pick";
import { swatchForGroup } from "../lib/stageGroups";
import "./touch.css";

/** Working pixels shown across the magnifier. */
const SPAN = 11;
const SIZE = 88;
const NOTE_MS = 3200;

interface Pick {
  x: number;
  y: number;
  /** Where the pixel sits in the picking layer, in CSS pixels. */
  at: { x: number; y: number };
  keyboard: boolean;
}

const MESSAGES: Record<PinOutcome, (hex: string) => string> = {
  pinned: (hex) => `Pinned ${hex}.`,
  already: (hex) => `${hex} is already pinned.`,
  full: () => "The palette is full at 10 colors. Unlock one to pin another.",
  busy: () => "Still finding colors. Try again in a moment.",
};

/**
 * Hover (or arrow keys, or a tap in pick mode) over the photo to read one
 * pixel's color in a magnifier and see which swatch owns it; click or press
 * Enter to pin that exact color into the palette.
 */
export default function Loupe({
  samples,
  swatches,
  hero,
  onPin,
}: {
  samples: StageSamples;
  swatches: RGB[];
  hero: RefObject<HTMLImageElement>;
  onPin: (color: RGB) => PinOutcome;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const work = useRef<{
    samples: StageSamples;
    canvas: HTMLCanvasElement;
    data: ImageData;
  } | null>(null);
  const hint = useId();
  const [pick, setPick] = useState<Pick | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState("");
  const noteTimer = useRef<number>();
  const { width, height } = samples;

  const grid = useMemo(
    () => ownerGrid(samples, swatchForGroup(samples.groupColors, swatches)),
    [samples, swatches],
  );
  const names = useMemo(() => paletteColorNames(swatches), [swatches]);

  // The photo at the size the quantizer saw, so a pick is the color it
  // counted. Null when the browser will not let the page read the photo.
  const pixels = useCallback(() => {
    if (work.current?.samples === samples) return work.current;
    const image = hero.current;
    if (!image?.complete || !image.naturalWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    try {
      context.drawImage(image, 0, 0, width, height);
      work.current = {
        samples,
        canvas,
        data: context.getImageData(0, 0, width, height),
      };
    } catch {
      return null;
    }
    return work.current;
  }, [hero, samples, width, height]);

  const colorAt = useCallback(
    (x: number, y: number): RGB | null => {
      const source = pixels();
      if (!source) return null;
      const i = (y * width + x) * 4;
      const { data } = source.data;
      return data[i + 3] < 125
        ? null
        : { r: data[i], g: data[i + 1], b: data[i + 2] };
    },
    [pixels, width],
  );

  const color = pick ? colorAt(pick.x, pick.y) : null;
  const owner =
    pick && color
      ? swatchOwning(grid, pick.y * width + pick.x, color, swatches)
      : -1;
  const hex = color ? rgbToHex(color) : "";

  // The owning swatch gets a mark from outside its component.
  useEffect(() => {
    document
      .querySelectorAll(".swatch[data-picked]")
      .forEach((swatch) => swatch.removeAttribute("data-picked"));
    if (owner < 0) return;
    document
      .querySelector(`.swatch-color[data-swatch-index="${owner}"]`)
      ?.closest(".swatch")
      ?.setAttribute("data-picked", "");
    return () =>
      document
        .querySelectorAll(".swatch[data-picked]")
        .forEach((swatch) => swatch.removeAttribute("data-picked"));
  }, [owner]);

  useEffect(() => {
    const element = zoom.current,
      source = pixels();
    const context = element?.getContext("2d");
    if (!element || !context || !source || !pick) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, SIZE, SIZE);
    const half = (SPAN - 1) / 2;
    context.drawImage(
      source.canvas,
      pick.x - half,
      pick.y - half,
      SPAN,
      SPAN,
      0,
      0,
      SIZE,
      SIZE,
    );
  }, [pick, pixels]);

  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  const place = (clientX: number, clientY: number, keyboard = false) => {
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    const cover = coverFit(box, width, height);
    const found = pixelAt(
      { x: clientX - box.left, y: clientY - box.top },
      cover,
      width,
      height,
    );
    setPick(
      found && {
        ...found,
        at: pointOf(found, cover),
        keyboard,
      },
    );
  };
  const placePixel = (x: number, y: number, keyboard: boolean) => {
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    const cover = coverFit(box, width, height);
    setPick({ x, y, at: pointOf({ x, y }, cover), keyboard });
  };

  const say = (message: string) => {
    setNote(message);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(""), NOTE_MS);
  };
  const pin = (x: number, y: number) => {
    const picked = colorAt(x, y);
    if (!picked) return;
    say(MESSAGES[onPin(picked)](rgbToHex(picked)));
  };

  // Touch only picks while the toggle is on, so taps and scrolls over the
  // photo behave as usual otherwise.
  const live = (event: PointerEvent) =>
    event.pointerType !== "touch" || picking;
  const move = (event: PointerEvent) => {
    if (event.type === "pointerdown") pressed.current = true;
    if (live(event)) place(event.clientX, event.clientY);
  };
  const lift = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || !live(event)) return;
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    const found = pixelAt(
      { x: event.clientX - box.left, y: event.clientY - box.top },
      coverFit(box, width, height),
      width,
      height,
    );
    if (found) pin(found.x, found.y);
    if (event.pointerType === "touch") setPick(null);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== "touch" && !pick?.keyboard) setPick(null);
  };
  // A tap or click that happens to focus the layer is not a keyboard
  // user arriving, so only focus with no pointer press starts the cursor.
  const pressed = useRef(false);
  const focus = () => {
    if (pressed.current) return;
    if (!pick) placePixel(Math.floor(width / 2), Math.floor(height / 2), true);
  };
  const blur = () => {
    pressed.current = false;
    setPick(null);
  };
  const press = (event: KeyboardEvent) => {
    pressed.current = false;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setPicking(false);
      layer.current?.blur();
      document
        .querySelector<HTMLElement>(".stage-switch button[aria-pressed=true]")
        ?.focus();
      return;
    }
    const from = pick ?? {
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
    };
    if (event.key === "Enter") {
      event.preventDefault();
      pin(from.x, from.y);
      return;
    }
    const next = moveCursor(from, event.key, event.shiftKey, width, height);
    if (!next) return;
    event.preventDefault();
    placePixel(next.x, next.y, true);
  };

  const box = layer.current?.getBoundingClientRect();
  const loupeLeft = pick
    ? Math.min(
        Math.max(pick.at.x - SIZE / 2, 4),
        (box?.width ?? 400) - SIZE - 12,
      )
    : 0;
  const loupeTop = pick
    ? pick.at.y > SIZE + 56
      ? pick.at.y - SIZE - 44
      : pick.at.y + 22
    : 0;
  const near = owner >= 0 ? `, near ${names[owner]}` : "";

  return (
    <>
      <div
        ref={layer}
        className="photo-pick"
        data-picking={picking ? "" : undefined}
        data-pick-hex={hex || undefined}
        data-pick-owner={owner >= 0 ? owner : undefined}
        tabIndex={0}
        role="group"
        aria-label="Photo color picker"
        aria-describedby={hint}
        onPointerMove={move}
        onPointerDown={move}
        onPointerUp={lift}
        onPointerLeave={leave}
        onFocus={focus}
        onBlur={blur}
        onKeyDown={press}
      >
        {pick && color && (
          <>
            {pick.keyboard && (
              <i
                className="pick-ring"
                style={{ left: pick.at.x, top: pick.at.y }}
              />
            )}
            <div className="loupe" style={{ left: loupeLeft, top: loupeTop }}>
              <canvas
                ref={zoom}
                width={SIZE}
                height={SIZE}
                aria-hidden="true"
              />
              <i className="loupe-cross" />
              <code className="loupe-hex">{hex}</code>
            </div>
          </>
        )}
      </div>
      <span id={hint} className="sr-only">
        Arrow keys move the cursor, Shift moves it further, Enter pins the
        color, Escape leaves.
      </span>
      <span className="sr-only" aria-live="polite">
        {pick?.keyboard && color ? `${hex}${near}` : ""}
      </span>
      <button
        type="button"
        className="pick-toggle"
        aria-pressed={picking}
        onClick={() => {
          setPicking(!picking);
          setPick(null);
        }}
      >
        Pick a color
      </button>
      <span className="photo-note pin-note" role="status" hidden={!note}>
        {note}
      </span>
    </>
  );
}
