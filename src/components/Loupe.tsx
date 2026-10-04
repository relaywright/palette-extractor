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
  clampPixel,
  coverFit,
  loupePlacement,
  moveCursor,
  ownerGrid,
  pixelAt,
  pointOf,
  swatchOwning,
  visiblePixels,
} from "../lib/pick";
import { buildModel, recolorPixels, type RecolorModel } from "../recolor/math";
import { swatchForGroup } from "../lib/stageGroups";
import type { Fit } from "./photoFit";
import "./touch.css";

/** Working pixels shown across the magnifier. */
const SPAN = 11;
const SIZE = 88;
/** The magnifier with its hex row, borders included (see `.loupe`). */
const LOUPE = { width: SIZE, height: 111 };
const NOTE_MS = 3200;

/**
 * A working pixel. A keyboard pick's place on screen is worked out from the
 * layout, so it follows a resize; a pointer pick sits at the pointer
 * (`near`), which can be well away from the pixel's center when one working
 * pixel spans many screen pixels.
 */
interface Pick {
  x: number;
  y: number;
  keyboard: boolean;
  near?: { x: number; y: number };
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
 * Enter to pin that exact color into the palette. The magnifier and the pin
 * take the color the viewer sees: the photo through any recolor edits
 * (`colors` against the extracted `swatches`). Which swatch owns a pixel
 * comes from the extraction, so an edit never moves a pixel to another one.
 */
export default function Loupe({
  samples,
  swatches,
  colors,
  hero,
  fit,
  onPin,
}: {
  samples: StageSamples;
  swatches: RGB[];
  colors: RGB[];
  hero: RefObject<HTMLImageElement>;
  fit: Fit;
  onPin: (color: RGB) => PinOutcome;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const base = useRef<{ samples: StageSamples; data: ImageData } | null>(null);
  const seen = useRef<{
    samples: StageSamples;
    model: RecolorModel | null;
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
  const names = useMemo(() => paletteColorNames(colors), [colors]);
  const model = useMemo(() => buildModel(swatches, colors), [swatches, colors]);
  const cover = useMemo(
    () =>
      fit.box.width && fit.box.height
        ? coverFit(
            fit.box,
            width,
            height,
            fit.natural.width,
            fit.natural.height,
          )
        : null,
    [fit, width, height],
  );

  // The photo at the size the quantizer saw, so a pick is the color it
  // counted. Null when the browser will not let the page read the photo.
  const original = useCallback((): ImageData | null => {
    if (base.current?.samples === samples) return base.current.data;
    const image = hero.current;
    if (!image?.complete || !image.naturalWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    try {
      context.drawImage(image, 0, 0, width, height);
      base.current = {
        samples,
        data: context.getImageData(0, 0, width, height),
      };
    } catch {
      return null;
    }
    return base.current.data;
  }, [hero, samples, width, height]);

  // The same pixels through the recolor, as the page shows them.
  const view = useCallback(() => {
    if (seen.current?.samples === samples && seen.current.model === model)
      return seen.current;
    const data = original();
    if (!data) return null;
    const recolored = model
      ? new ImageData(recolorPixels(data.data, model), width, height)
      : data;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.putImageData(recolored, 0, 0);
    seen.current = { samples, model, canvas, data: recolored };
    return seen.current;
  }, [original, samples, model, width, height]);

  const readAt = useCallback(
    (x: number, y: number): { seen: RGB; original: RGB } | null => {
      const photo = original(),
        shown = view();
      if (!photo || !shown) return null;
      const i = (y * width + x) * 4;
      if (photo.data[i + 3] < 125) return null;
      const rgb = (data: Uint8ClampedArray): RGB => ({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
      });
      return { seen: rgb(shown.data.data), original: rgb(photo.data) };
    },
    [original, view, width],
  );

  const read = pick ? readAt(pick.x, pick.y) : null;
  const color = read?.seen ?? null;
  const owner =
    pick && read
      ? swatchOwning(grid, pick.y * width + pick.x, read.original, swatches)
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
      shown = view();
    const context = element?.getContext("2d");
    if (!element || !context || !shown || !pick) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, SIZE, SIZE);
    const half = (SPAN - 1) / 2;
    context.drawImage(
      shown.canvas,
      pick.x - half,
      pick.y - half,
      SPAN,
      SPAN,
      0,
      0,
      SIZE,
      SIZE,
    );
  }, [pick, view]);

  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  // The layer's box as it is now, read when a pointer or key needs it.
  const frame = () => {
    const box = layer.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    return {
      box,
      cover: coverFit(
        box,
        width,
        height,
        fit.natural.width,
        fit.natural.height,
      ),
    };
  };
  const pixelUnder = (clientX: number, clientY: number) => {
    const now = frame();
    if (!now) return null;
    const near = { x: clientX - now.box.left, y: clientY - now.box.top };
    const pixel = pixelAt(near, now.cover, width, height);
    return pixel && { ...pixel, near };
  };
  // Keyboard picks stay on the part of the photo that shows.
  const placePixel = (pixel: { x: number; y: number }) => {
    const now = frame();
    const at = now
      ? clampPixel(pixel, visiblePixels(now.box, now.cover, width, height))
      : pixel;
    setPick({ ...at, keyboard: true });
  };

  // A resize can crop away the cursor's pixel, so the cursor moves to the
  // nearest pixel that shows rather than waiting for the next key.
  useEffect(() => {
    setPick((current) => {
      const now = frame();
      if (!current?.keyboard || !now) return current;
      const at = clampPixel(
        current,
        visiblePixels(now.box, now.cover, width, height),
      );
      return at.x === current.x && at.y === current.y
        ? current
        : { ...current, ...at };
    });
  }, [fit, width, height]);

  const say = (message: string) => {
    setNote(message);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(""), NOTE_MS);
  };
  const pin = (x: number, y: number) => {
    const picked = readAt(x, y)?.seen;
    if (!picked) return;
    say(MESSAGES[onPin(picked)](rgbToHex(picked)));
  };

  // Touch only picks while the toggle is on, so taps and scrolls over the
  // photo behave as usual otherwise.
  const live = (event: PointerEvent) =>
    event.pointerType !== "touch" || picking;
  const track = (event: PointerEvent) => {
    if (!live(event)) return;
    const found = pixelUnder(event.clientX, event.clientY);
    setPick(found && { ...found, keyboard: false });
  };
  // A release only pins when its press began on the photo: a drag that ends
  // over it is not a click.
  const down = useRef<number | null>(null);
  const start = (event: PointerEvent) => {
    pressed.current = true;
    down.current =
      event.isPrimary && event.button === 0 ? event.pointerId : null;
    track(event);
  };
  const lift = (event: PointerEvent) => {
    const began = down.current === event.pointerId;
    down.current = null;
    if (!began || !event.isPrimary || event.button !== 0 || !live(event))
      return;
    const found = pixelUnder(event.clientX, event.clientY);
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
    if (!pick)
      placePixel({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
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
    const now = frame();
    const bounds = now
      ? visiblePixels(now.box, now.cover, width, height)
      : undefined;
    const current = pick ?? {
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
    };
    const from = bounds ? clampPixel(current, bounds) : current;
    if (event.key === "Enter") {
      event.preventDefault();
      pin(from.x, from.y);
      return;
    }
    const next = moveCursor(
      from,
      event.key,
      event.shiftKey,
      width,
      height,
      bounds,
    );
    if (!next) return;
    event.preventDefault();
    placePixel(next);
  };

  const at = pick && (pick.near ?? (cover ? pointOf(pick, cover) : null));
  const spot = at ? loupePlacement(at, fit.box, LOUPE) : null;
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
        onPointerMove={track}
        onPointerDown={start}
        onPointerUp={lift}
        onPointerCancel={() => (down.current = null)}
        onPointerLeave={leave}
        onFocus={focus}
        onBlur={blur}
        onKeyDown={press}
      >
        {pick && color && at && spot && (
          <>
            {pick.keyboard && (
              <i className="pick-ring" style={{ left: at.x, top: at.y }} />
            )}
            <div className="loupe" style={spot}>
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
