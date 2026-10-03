import { useLayoutEffect, useMemo, useRef } from "react";
import type { RGB } from "../lib/color";
import type { StageSamples } from "../lib/extraction";
import {
  hardMask,
  litSamples,
  maskPopulation,
  maskRadius,
  scrimPixels,
  softMask,
} from "../lib/mask";
import { paletteColorNames } from "../lib/names";
import { NO_SWATCH, swatchForGroup } from "../lib/stageGroups";
import "./touch.css";

/**
 * Dims the photo except where the focused swatch's sampled pixels sit. The
 * mask comes from the samples the quantizer grouped, so it shows which
 * pixels fed that color, not an outline of an object.
 */
export default function PhotoFocus({
  samples,
  swatches,
  focus,
}: {
  samples: StageSamples;
  swatches: RGB[];
  focus: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const groupSwatch = useMemo(
    () => swatchForGroup(samples.groupColors, swatches),
    [samples, swatches],
  );
  const names = useMemo(() => paletteColorNames(swatches), [swatches]);
  const radius = useMemo(() => maskRadius(samples), [samples]);
  // The last swatch shown stays drawn while the dim fades out.
  const shown = useRef(-1);
  if (focus >= 0) shown.current = focus;
  const index = focus >= 0 ? focus : shown.current;

  const lit = useMemo(
    () =>
      Uint8Array.from(groupSwatch, (swatch) =>
        swatch !== NO_SWATCH && swatch === index ? 1 : 0,
      ),
    [groupSwatch, index],
  );
  const counts = useMemo(
    () => ({
      pixels: maskPopulation(hardMask(samples, lit)),
      samples: litSamples(samples.groups, lit),
    }),
    [samples, lit],
  );

  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || index < 0) return;
    const pixels = scrimPixels(softMask(samples, lit, radius));
    context.putImageData(
      new ImageData(pixels, samples.width, samples.height),
      0,
      0,
    );
  }, [samples, lit, radius, index]);

  const on = focus >= 0;
  return (
    <>
      <canvas
        ref={canvas}
        className="photo-dim"
        width={samples.width}
        height={samples.height}
        aria-hidden="true"
        data-dim={on ? "on" : "off"}
        data-lit-pixels={on ? counts.pixels : undefined}
        data-lit-samples={on ? counts.samples : undefined}
        data-total-samples={samples.groups.length}
      />
      <span className="photo-note focus-note" hidden={!on}>
        Sampled pixels near {index >= 0 ? names[index] : ""}
      </span>
    </>
  );
}
