import { useEffect, useMemo, useRef, useState } from "react";
import type { Pixel, WeightedColor } from "@relaywright/median-cut";
import { Choice, Stepper } from "./controls";
import { reproject, type DitherMode } from "./dither";
import { Chip, Section, type PageData } from "./Section";
import { css, hex } from "./format";

const MIN_COLORS = 2;
const MAX_COLORS = 32;

export function ReprojectSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="reproject"
      number={8}
      title="Your photo in N colors"
      photo={data?.name}
      version={data?.version}
      figure={data && <ReprojectFigure key={data.version} data={data} />}
    >
      <p>
        A palette is only useful when you can put it to work. Reprojection
        redraws your photo using nothing but the palette&apos;s colors.
      </p>
      <p>
        With no dithering, each pixel takes its nearest palette color. Smooth
        gradients turn into flat bands.
      </p>
      <p>
        Ordered dithering first nudges each pixel by a fixed pattern, a 4 by 4
        Bayer matrix, and then picks the nearest color. Bands break up into a
        regular texture.
      </p>
      <p>
        Floyd-Steinberg dithering picks colors in reading order and passes each
        pixel&apos;s rounding error to the neighbors it has not reached yet:
        7/16 to the right, 3/16 below left, 5/16 below, and 1/16 below right.
        The error averages out across the area.
      </p>
    </Section>
  );
}

const MODES: { value: DitherMode; label: string }[] = [
  { value: "none", label: "No dithering" },
  { value: "ordered", label: "Ordered (Bayer 4x4)" },
  { value: "floyd-steinberg", label: "Floyd-Steinberg" },
];

function paint(canvas: HTMLCanvasElement | null, image: ImageData) {
  if (!canvas) return;
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.putImageData(image, 0, 0);
}

function ReprojectFigure({ data }: { data: PageData }) {
  const { analysis, rgba, client } = data;
  const [colorCount, setColorCount] = useState(analysis.count);
  const [mode, setMode] = useState<DitherMode>("floyd-steinberg");
  const [fetched, setFetched] = useState(
    () => new Map<number, WeightedColor[]>(),
  );
  const [failed, setFailed] = useState(false);
  const asked = useRef(new Set<number>());
  const original = useRef<HTMLCanvasElement>(null);
  const result = useRef<HTMLCanvasElement>(null);

  // The analysis already holds the palette it was run with.
  const ready =
    colorCount === analysis.count
      ? analysis.rgb.colors
      : fetched.get(colorCount);
  const lastReady = useRef(ready);
  if (ready) lastReady.current = ready;
  const colors = ready ?? lastReady.current ?? analysis.rgb.colors;

  useEffect(() => {
    if (ready || asked.current.has(colorCount)) return;
    asked.current.add(colorCount);
    client
      .palette(colorCount)
      .then((next) => setFetched((map) => new Map(map).set(colorCount, next)))
      .catch(() => setFailed(true));
  }, [ready, colorCount, client]);

  const palette = useMemo(
    () => colors.map(({ color }): Pixel => [color.r, color.g, color.b]),
    [colors],
  );
  const { image, used } = useMemo(() => {
    const out = reproject(rgba, analysis.width, analysis.height, palette, mode);
    const seen = new Set<number>();
    for (let i = 0; i < out.length; i += 4)
      if (out[i + 3]) seen.add((out[i] << 16) | (out[i + 1] << 8) | out[i + 2]);
    return {
      image: new ImageData(out, analysis.width, analysis.height),
      used: seen.size,
    };
  }, [rgba, analysis.width, analysis.height, palette, mode]);

  useEffect(
    () =>
      paint(
        original.current,
        new ImageData(rgba, analysis.width, analysis.height),
      ),
    [rgba, analysis.width, analysis.height],
  );
  useEffect(() => paint(result.current, image), [image]);

  const alt = `${analysis.width} by ${analysis.height} pixel`;
  return (
    <>
      <div className="how-pair" aria-busy={!ready}>
        <figure className="how-pair-item">
          <canvas
            ref={original}
            className="how-pixels"
            style={{ aspectRatio: `${analysis.width} / ${analysis.height}` }}
            role="img"
            aria-label={`Your photo at ${alt} resolution, in its own colors`}
          />
          <figcaption>Original</figcaption>
        </figure>
        <figure className="how-pair-item">
          <canvas
            ref={result}
            className="how-pixels"
            data-reproject-colors={palette.length}
            data-reproject-mode={mode}
            style={{ aspectRatio: `${analysis.width} / ${analysis.height}` }}
            role="img"
            aria-label={`Your photo redrawn with ${palette.length} colors, ${MODES.find((m) => m.value === mode)!.label.toLowerCase()}`}
          />
          <figcaption>{palette.length} colors</figcaption>
        </figure>
      </div>
      <ul className="how-chips" aria-label="Palette used">
        {colors.map(({ color }) => (
          <li key={hex(color)}>
            <Chip color={css(color)} />
            <code>{hex(color)}</code>
          </li>
        ))}
      </ul>
      <Choice<DitherMode>
        name="dither"
        legend="Dithering"
        value={mode}
        onChange={setMode}
        options={MODES}
      />
      <Stepper
        name="colors"
        label="Colors"
        min={MIN_COLORS}
        max={MAX_COLORS}
        value={colorCount}
        valueText={`${colorCount} colors`}
        onChange={setColorCount}
      >
        <output className="how-readout-inline">{colorCount}</output>
      </Stepper>
      <p className="how-readout" data-readout="reproject" aria-live="polite">
        {failed
          ? "The palette could not be updated. Reload the page and try again."
          : `The palette has ${palette.length} colors and the redrawn photo uses ${used} of them.`}
      </p>
    </>
  );
}
