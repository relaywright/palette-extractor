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
import { coverFit, visibleCrop } from "../lib/pick";
import { NO_SWATCH, swatchForGroup } from "../lib/stageGroups";
import type { Fit } from "./photoFit";
import "./touch.css";

/**
 * Dims the photo except where the focused swatch's sampled pixels sit. The
 * mask comes from the samples the quantizer grouped, so it shows which
 * pixels fed that color, not an outline of an object. Which samples belong
 * to a swatch is decided by the extracted `swatches`; `colors` are the ones
 * on screen (the same palette with any edits), which name it in the caption.
 */
export default function PhotoFocus({
  samples,
  swatches,
  colors,
  focus,
  fit,
}: {
  samples: StageSamples;
  swatches: RGB[];
  colors: RGB[];
  focus: number;
  fit: Fit;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const groupSwatch = useMemo(
    () => swatchForGroup(samples.groupColors, swatches),
    [samples, swatches],
  );
  const names = useMemo(() => paletteColorNames(colors), [colors]);
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
  // The scrim at the working size, drawn onto the photo's box below.
  const scrim = useMemo(() => {
    if (index < 0) return null;
    const mask = document.createElement("canvas");
    mask.width = samples.width;
    mask.height = samples.height;
    mask
      .getContext("2d")
      ?.putImageData(
        new ImageData(
          scrimPixels(softMask(samples, lit, radius)),
          samples.width,
          samples.height,
        ),
        0,
        0,
      );
    return mask;
  }, [samples, lit, radius, index]);

  // The canvas is as large as the photo's box, and the scrim is cropped into
  // it the way the photo is, from the photo's own proportions.
  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    const { box, natural } = fit;
    if (!element || !context || !scrim || !box.width || !box.height) return;
    element.width = box.width;
    element.height = box.height;
    const { width, height } = samples;
    const cover = coverFit(box, width, height, natural.width, natural.height);
    const { sx, sy, sw, sh } = visibleCrop(box, cover, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(scrim, sx, sy, sw, sh, 0, 0, box.width, box.height);
  }, [samples, scrim, fit]);

  const on = focus >= 0;
  return (
    <>
      <canvas
        ref={canvas}
        className="photo-dim"
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
