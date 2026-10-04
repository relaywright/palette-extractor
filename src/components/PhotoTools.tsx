import type { RefObject } from "react";
import type { PinOutcome } from "../hooks/usePalette";
import type { RGB } from "../lib/color";
import type { StageSamples } from "../lib/extraction";
import Loupe from "./Loupe";
import PhotoFocus from "./PhotoFocus";
import { useFit } from "./photoFit";

/**
 * Everything the Photo view adds over the photo, loaded together. `swatches`
 * are the extracted colors, which decide which samples belong to a swatch;
 * `colors` are the palette on screen, edits included.
 */
export default function PhotoTools({
  samples,
  swatches,
  colors,
  focus,
  hero,
  onPin,
}: {
  samples: StageSamples;
  swatches: RGB[];
  colors: RGB[];
  focus: number;
  hero: RefObject<HTMLImageElement>;
  onPin: (color: RGB) => PinOutcome;
}) {
  const fit = useFit(hero, samples);
  return (
    <>
      <PhotoFocus
        samples={samples}
        swatches={swatches}
        colors={colors}
        focus={focus}
        fit={fit}
      />
      <Loupe
        samples={samples}
        swatches={swatches}
        colors={colors}
        hero={hero}
        fit={fit}
        onPin={onPin}
      />
    </>
  );
}
