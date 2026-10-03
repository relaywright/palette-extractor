import type { RefObject } from "react";
import type { PinOutcome } from "../hooks/usePalette";
import type { RGB } from "../lib/color";
import type { StageSamples } from "../lib/extraction";
import Loupe from "./Loupe";
import PhotoFocus from "./PhotoFocus";

/** Everything the Photo view adds over the photo, loaded together. */
export default function PhotoTools({
  samples,
  swatches,
  focus,
  hero,
  onPin,
}: {
  samples: StageSamples;
  swatches: RGB[];
  focus: number;
  hero: RefObject<HTMLImageElement>;
  onPin: (color: RGB) => PinOutcome;
}) {
  return (
    <>
      <PhotoFocus samples={samples} swatches={swatches} focus={focus} />
      <Loupe samples={samples} swatches={swatches} hero={hero} onPin={onPin} />
    </>
  );
}
