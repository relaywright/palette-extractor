import { useMemo, useState } from "react";
import type { ColorSpace } from "@relaywright/median-cut";
import { CubeFigure, RotateControl, START_ANGLE } from "./CubeFigure";
import { count, css, hex, AXIS_LETTERS } from "./format";
import { drawFinal } from "./overlay";
import { Chip, Section, type PageData } from "./Section";

const AXIS_COLORS: Record<ColorSpace, string[]> = {
  rgb: ["#e8a69e", "#afccb6", "#9fbdde"],
  oklab: ["#d9d6cf", "#e8a69e", "#9fbdde"],
};

function Legend({ space }: { space: ColorSpace }) {
  return (
    <p className="how-legend">
      {AXIS_LETTERS[space].map((letter, k) => (
        <span key={letter} style={{ color: AXIS_COLORS[space][k] }}>
          {letter}
        </span>
      ))}
    </p>
  );
}

export function ColorSpaceSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="color-space"
      number={2}
      title="Color space"
      photo={data?.name}
      version={data?.version}
      figure={data && <ColorSpaceFigure key={data.version} data={data} />}
    >
      <p>
        Every pixel is three numbers: how much red, green and blue it holds,
        each from 0 to 255. Use those numbers as coordinates and each pixel
        becomes a point inside a cube.
      </p>
      <p>
        Pixels with similar colors sit close together, so a photo&apos;s colors
        form clumps and smears instead of filling the cube.
      </p>
      <p>
        Drag the cube to turn it, or use the Rotate slider. The cloud shows up
        to 20,000 points from your 320 pixel photo, each in its own color.
      </p>
    </Section>
  );
}

function ColorSpaceFigure({ data }: { data: PageData }) {
  const { analysis } = data;
  const [angle, setAngle] = useState(START_ANGLE);
  const { samples } = analysis.rgb;
  const shown = samples.groups.length;
  return (
    <>
      <CubeFigure
        name="color-space"
        samples={samples}
        space="rgb"
        angle={angle}
        onAngle={setAngle}
        label={`${count(shown)} pixels from your photo plotted in an RGB color cube`}
      />
      <div className="how-figure-row">
        <RotateControl angle={angle} onAngle={setAngle} />
        <Legend space="rgb" />
      </div>
      <p className="how-readout" data-readout="color-space">
        Showing {count(shown)} of {count(analysis.pixelCount)} pixels.
      </p>
    </>
  );
}

export function SpacesSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="rgb-vs-oklab"
      number={7}
      title="RGB versus OKLab"
      photo={data?.name}
      version={data?.version}
      figure={data && <SpacesFigure key={data.version} data={data} />}
    >
      <p>
        RGB treats a step of 10 in red, green or blue as the same size
        everywhere. Eyes do not. Two greens 40 steps apart can look clearly
        different, while a green and a yellow-green 50 steps apart can look
        almost the same.
      </p>
      <p>
        The perceptual mode runs the identical algorithm on OKLab coordinates, a
        color space built so that equal distances look about equally different.
        The cuts, the scoring and the snap stay the same. Only the axes change.
      </p>
      <p>
        Both runs on your photo are below. Turn the cubes to see how the same
        pixels spread out in each space. Each marker is a final color, sized by
        how much of the photo it covers.
      </p>
    </Section>
  );
}

function SpacesFigure({ data }: { data: PageData }) {
  const { analysis } = data;
  const [angle, setAngle] = useState(START_ANGLE);
  const runs = [
    { run: analysis.rgb, title: "RGB", name: "rgb" },
    { run: analysis.oklab, title: "OKLab", name: "oklab" },
  ] as const;
  const overlays = useMemo(
    () => ({
      rgb: drawFinal(analysis.rgb.steps, "rgb"),
      oklab: drawFinal(analysis.oklab.steps, "oklab"),
    }),
    [analysis],
  );
  const hexes = {
    rgb: new Set(analysis.rgb.colors.map((c) => hex(c.color))),
    oklab: new Set(analysis.oklab.colors.map((c) => hex(c.color))),
  };
  const differing = analysis.oklab.colors.filter(
    (c) => !hexes.rgb.has(hex(c.color)),
  ).length;
  return (
    <>
      <div className="how-pair">
        {runs.map(({ run, title, name }) => (
          <div key={name} className="how-pair-item" data-space={name}>
            <h3>{title}</h3>
            <CubeFigure
              name={`space-${name}`}
              samples={run.samples}
              space={run.space}
              angle={angle}
              onAngle={setAngle}
              overlay={overlays[name]}
              label={`The photo's pixels in ${title} space, with the final ${run.colors.length} colors marked`}
            />
            <Legend space={run.space} />
            <ul className="how-chips" aria-label={`${title} palette`}>
              {run.colors.map(({ color }) => (
                <li key={hex(color)}>
                  <Chip color={css(color)} />
                  <code>{hex(color)}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="how-figure-row">
        <RotateControl angle={angle} onAngle={setAngle} />
      </div>
      <p className="how-readout" data-readout="rgb-vs-oklab">
        {differing === 0
          ? "Both spaces found the same colors for this photo."
          : `${differing} of ${analysis.oklab.colors.length} colors differ between the two palettes.`}
      </p>
    </>
  );
}
