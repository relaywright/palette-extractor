import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_DIMENSION, paletteFor, workingSize } from "./analysis";
import { ALPHA_MIN } from "./dither";
import { count, css, hex } from "./format";
import { Chip, Section, type PageData } from "./Section";
import { Stepper } from "./controls";

/** Longest edges the figure compares, ending at the size the app uses. */
const SIZES = [16, 40, 80, 160, MAX_DIMENSION];

export function SamplingSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="sampling"
      number={1}
      title="Sampling the image"
      photo={data?.name}
      version={data?.version}
      figure={data && <SamplingFigure key={data.version} data={data} />}
    >
      <p>
        Median cut works on pixels, so the first job is choosing which ones. The
        page draws your photo onto a canvas whose longest side is at most 320
        pixels. A 4000 by 3000 photo becomes 320 by 240: 76,800 pixels instead
        of 12 million.
      </p>
      <p>
        Pixels that are mostly transparent are skipped, so a cut-out logo does
        not fill the palette with its empty background. Every other pixel counts
        once.
      </p>
      <p>
        Move the slider to compare working sizes. Each size shows the eight
        colors median cut finds at that size.
      </p>
    </Section>
  );
}

function SamplingFigure({ data }: { data: PageData }) {
  const { img, analysis } = data;
  const [index, setIndex] = useState(SIZES.length - 1);
  const longest = SIZES[index];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const view = useMemo(() => {
    const { width, height } = workingSize(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      longest,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    let kept = 0;
    for (let i = 3; i < pixels.data.length; i += 4)
      if (pixels.data[i] >= ALPHA_MIN) kept++;
    // The full-size run is already done; smaller ones are quick.
    const colors =
      longest === MAX_DIMENSION && width === analysis.width
        ? analysis.rgb.colors
        : paletteFor(pixels.data, analysis.count);
    return { width, height, pixels, kept, colors };
  }, [img, analysis, longest]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = view.width;
    canvas.height = view.height;
    canvas.getContext("2d")!.putImageData(view.pixels, 0, 0);
  }, [view]);

  const total = view.width * view.height;
  return (
    <>
      <div className="how-sampling">
        <canvas
          ref={canvasRef}
          className="how-pixels"
          style={{ aspectRatio: `${view.width} / ${view.height}` }}
          role="img"
          aria-label={`Your photo drawn ${view.width} pixels wide and ${view.height} tall`}
        />
        <div>
          <ul className="how-chips" aria-label="Colors found at this size">
            {view.colors.map(({ color }) => (
              <li key={hex(color)}>
                <Chip color={css(color)} />
                <code>{hex(color)}</code>
              </li>
            ))}
          </ul>
          <dl className="how-facts" data-sampling-facts>
            <div>
              <dt>Working size</dt>
              <dd data-sampling-size>
                {view.width} by {view.height}
              </dd>
            </div>
            <div>
              <dt>Pixels sampled</dt>
              <dd data-sampling-count>{count(view.kept)}</dd>
            </div>
            <div>
              <dt>Skipped as transparent</dt>
              <dd>{count(total - view.kept)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <Stepper
        name="sampling"
        label="Longest side"
        min={0}
        max={SIZES.length - 1}
        value={index}
        valueText={`${longest} pixels`}
        onChange={setIndex}
      >
        <output className="how-readout-inline">{longest} px</output>
      </Stepper>
    </>
  );
}
