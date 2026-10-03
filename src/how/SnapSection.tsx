import { useMemo, useState } from "react";
import { Chip, Section, type PageData } from "./Section";
import { count, css, hex, percent } from "./format";
import { snapBoxes } from "./splitMath";

export function SnapSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="snap"
      number={6}
      title="Snapping to a real pixel"
      photo={data?.name}
      version={data?.version}
      figure={data && <SnapFigure key={data.version} data={data} />}
    >
      <p>
        When the boxes are done, each one needs a single color. The obvious
        choice is the average of its pixels.
      </p>
      <p>
        An average can be a color that appears nowhere in the photo. A box
        holding both dark brown and pale gold averages to a muddy tan that no
        pixel has.
      </p>
      <p>
        Median cut takes the pixel in the box that sits closest to the average
        instead, so every swatch is a color the photo really contains. Pick a
        box to compare the two. This view uses the RGB run.
      </p>
    </Section>
  );
}

function SnapFigure({ data }: { data: PageData }) {
  const { analysis } = data;
  const run = analysis.rgb;
  const last = run.steps.length - 1;
  const snaps = useMemo(
    () => snapBoxes(run.steps[last], analysis.pixels, run.boxes, last),
    [run, analysis.pixels, last],
  );
  // Opens on the box where snapping moves the color furthest.
  const [selected, setSelected] = useState(() =>
    snaps.reduce(
      (best, s, i) => (s.distance > snaps[best].distance ? i : best),
      0,
    ),
  );
  const snap = snaps[selected];
  const invented = snaps.filter((s) => !s.averageInPhoto).length;
  return (
    <>
      <div className="how-snap" data-snap-box={selected + 1}>
        <div className="how-snap-card">
          <span
            className="how-snap-swatch"
            style={{ background: css(snap.average) }}
            role="img"
            aria-label={`Average color ${hex(snap.average)}`}
          />
          <strong>Average</strong>
          <code>{hex(snap.average)}</code>
          <span className="how-snap-note">
            {snap.averageInPhoto ? "In the photo" : "Not in the photo"}
          </span>
        </div>
        <span className="how-snap-arrow" aria-hidden="true">
          to
        </span>
        <div className="how-snap-card">
          <span
            className="how-snap-swatch"
            style={{ background: css(snap.snapped) }}
            role="img"
            aria-label={`Real pixel ${hex(snap.snapped)}`}
          />
          <strong>Real pixel</strong>
          <code>{hex(snap.snapped)}</code>
          <span className="how-snap-note">Always in the photo</span>
        </div>
      </div>
      <div className="how-box-picker" role="group" aria-label="Choose a box">
        {snaps.map((entry, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
          >
            <Chip color={css(entry.snapped)} />
            <span>Box {i + 1}</span>
          </button>
        ))}
      </div>
      <p className="how-readout" data-readout="snap" aria-live="polite">
        <strong>Box {selected + 1}</strong> holds {count(snap.population)}{" "}
        pixels ({percent(snap.population, analysis.pixelCount)} of the photo).{" "}
        {snap.distance === 0
          ? "Its average is already a real pixel, so nothing moves."
          : `The swatch moves ${snap.distance.toFixed(1)} steps in RGB from the average to the nearest real pixel.`}{" "}
        Across all {snaps.length} boxes, {invented}{" "}
        {invented === 1 ? "average does" : "averages do"} not appear in this
        photo.
      </p>
    </>
  );
}
