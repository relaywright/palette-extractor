import { useCallback, useEffect, useMemo, useState } from "react";
import { CubeFigure, RotateControl, START_ANGLE } from "./CubeFigure";
import { Choice, Stepper } from "./controls";
import { AXIS_NAMES, axisGradient, count, css, percent } from "./format";
import { Histogram } from "./Histogram";
import { drawSplit } from "./overlay";
import { Chip, Section, useReducedMotion, type PageData } from "./Section";
import {
  axisHistogram,
  countBetween,
  cutValueOf,
  describeSplit,
  medianOf,
  pickBox,
  scoreBoxes,
  type SplitRule,
} from "./splitMath";

const splittable = (data: PageData) => data.analysis.rgb.steps.length > 1;

/** Stands in for a figure when the photo is too flat to split at all. */
function TooFlat() {
  return (
    <p className="how-readout">
      This photo has too few distinct colors to split. Try another photo.
    </p>
  );
}

/** Everything one split's figures need, from the RGB run. */
function useSplits(data: PageData) {
  const run = data.analysis.rgb;
  const { analysis } = data;
  const infos = useMemo(
    () =>
      Array.from({ length: run.steps.length - 1 }, (_, k) =>
        describeSplit(run.steps, k + 1, analysis.count),
      ),
    [run, analysis.count],
  );
  const histogram = useCallback(
    (split: number) => {
      const info = infos[split - 1];
      return axisHistogram(
        run.coords,
        run.boxes,
        analysis.pixelCount,
        split - 1,
        info.boxIndex,
        info.axis,
      );
    },
    [run, infos, analysis.pixelCount],
  );
  return { run, infos, histogram };
}

export function SplitSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="one-split"
      number={3}
      title="One split at a time"
      photo={data?.name}
      version={data?.version}
      figure={
        data &&
        (splittable(data) ? (
          <SplitFigure key={data.version} data={data} />
        ) : (
          <TooFlat />
        ))
      }
    >
      <p>
        Median cut starts with one box around every pixel. Each split picks a
        box, finds its longest side, and cuts across it. The two halves replace
        the box, and the process repeats until there are as many boxes as colors
        you asked for. Here that is eight boxes, so seven splits.
      </p>
      <p>
        Step through the splits on your photo. The bright box in the cube is the
        one being cut, and the gold plane is where the cut falls.
      </p>
      <p>
        The histogram counts that box&apos;s pixels along the cut axis, one bar
        for each value from 0 to 255. Everything left of the line goes into one
        new box, and everything right of it into the other.
      </p>
    </Section>
  );
}

const PLAY_MS = 1100;

function SplitFigure({ data }: { data: PageData }) {
  const { run, infos, histogram } = useSplits(data);
  const reduced = useReducedMotion();
  const last = infos.length;
  // Reduced motion opens on the finished run; otherwise the first cut.
  const [split, setSplit] = useState(() => (reduced ? last : 1));
  const [angle, setAngle] = useState(START_ANGLE);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (split >= last) setPlaying(false);
      else setSplit(split + 1);
    }, PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, split, last]);

  const info = infos[split - 1];
  const counts = useMemo(() => histogram(split), [histogram, split]);
  const overlay = useMemo(() => drawSplit(run.steps, info), [run, info]);
  const before = run.steps[split - 1][info.boxIndex];
  const total = data.analysis.pixelCount;
  const axisName = AXIS_NAMES.rgb[info.axis];
  const at = (info.lowMax + info.highMin + 1) / 2;
  return (
    <>
      <div className="how-pair">
        <div className="how-pair-item">
          <CubeFigure
            name="one-split"
            samples={run.samples}
            space="rgb"
            angle={angle}
            onAngle={setAngle}
            overlay={overlay}
            label={`Split ${split} of ${last}: the box being cut and the plane where it is cut, in an RGB cube of your photo's pixels`}
          />
          <RotateControl angle={angle} onAngle={setAngle} />
        </div>
        <div className="how-pair-item">
          <Histogram
            name="one-split"
            counts={counts}
            line={at}
            gap={[info.lowMax, info.highMin]}
            gradient={axisGradient("rgb", info.axis)}
            label={`Histogram of ${axisName} values in the box being cut. The cut falls between ${info.lowMax} and ${info.highMin}.`}
          />
          <p className="how-key" aria-hidden="true">
            <span className="how-key-low">Goes low</span>
            <span className="how-key-high">Goes high</span>
            <span className="how-key-cut">Cut</span>
          </p>
        </div>
      </div>
      <Stepper
        name="one-split"
        label="Split"
        min={1}
        max={last}
        value={split}
        valueText={`Split ${split} of ${last}`}
        onChange={(next) => {
          setPlaying(false);
          setSplit(next);
        }}
      >
        {!reduced && (
          <button
            type="button"
            className="button quiet"
            onClick={() => {
              if (!playing && split >= last) setSplit(1);
              setPlaying(!playing);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
      </Stepper>
      <p
        className="how-readout"
        data-readout="one-split"
        data-split-count={last}
        data-split={split}
        aria-live="polite"
      >
        <strong>
          Split {split} of {last}.
        </strong>{" "}
        The box holds {count(before.population)} pixels (
        {percent(before.population, total)} of the photo). Its longest side is{" "}
        {axisName}, from {info.bounds.min[info.axis]} to{" "}
        {info.bounds.max[info.axis]}. The cut falls between {info.lowMax} and{" "}
        {info.highMin}: {count(info.lowPopulation)} pixels go low and{" "}
        {count(info.highPopulation)} go high.
      </p>
    </>
  );
}

export function GapSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="gap"
      number={4}
      title="Why the cut lands in the gap"
      photo={data?.name}
      version={data?.version}
      figure={
        data &&
        (splittable(data) ? (
          <GapFigure key={data.version} data={data} />
        ) : (
          <TooFlat />
        ))
      }
    >
      <p>
        The simplest cut is at the median, which puts half the pixels on each
        side. It goes wrong when one color cluster holds more than half the box.
        The median then sits inside that cluster, and the cut slices it in two.
      </p>
      <p>
        Median cut moves the cut away from the median, toward the middle of the
        box&apos;s longer side. That spot tends to fall in the empty stretch
        between two clusters, so each cluster stays whole.
      </p>
      <p>
        Pick a split, then switch between the two cut positions. The readout
        counts the pixels that would change sides.
      </p>
    </Section>
  );
}

type CutAt = "median" | "gap";

function GapFigure({ data }: { data: PageData }) {
  const { infos, histogram } = useSplits(data);
  const [split, setSplit] = useState(1);
  const [cutAt, setCutAt] = useState<CutAt>("gap");
  const info = infos[split - 1];
  const counts = useMemo(() => histogram(split), [histogram, split]);
  const axis = info.axis;
  const median = medianOf(counts);
  const rule = cutValueOf(info.bounds.min[axis], info.bounds.max[axis], median);
  const lo = Math.min(median, rule);
  const hi = Math.max(median, rule);
  let moved = 0;
  for (let v = lo + 1; v <= hi; v++) moved += counts[v];
  const box = info.lowPopulation + info.highPopulation;
  const wide = info.highMin - info.lowMax - 1;
  const gapLine = (info.lowMax + info.highMin + 1) / 2;
  const medianLine = median + 0.5;
  const within = (center: number) =>
    countBetween(counts, center - 6, center + 5);
  const nearMedian = within(median);
  const nearCut = within(Math.round((info.lowMax + info.highMin) / 2));
  return (
    <>
      <Histogram
        name="gap"
        counts={counts}
        line={cutAt === "gap" ? gapLine : medianLine}
        mark={cutAt === "gap" ? medianLine : gapLine}
        gap={[info.lowMax, info.highMin]}
        gradient={axisGradient("rgb", axis)}
        label={`Histogram of ${AXIS_NAMES.rgb[axis]} values in split ${split}. The median is ${median}; median cut cuts between ${info.lowMax} and ${info.highMin}.`}
      />
      <p className="how-key" aria-hidden="true">
        <span className="how-key-low">Goes low</span>
        <span className="how-key-high">Goes high</span>
        <span className="how-key-cut">
          {cutAt === "gap" ? "Median cut's cut" : "Median"}
        </span>
        <span className="how-key-mark">
          {cutAt === "gap" ? "Median" : "Median cut's cut"}
        </span>
      </p>
      <Choice<CutAt>
        name="gap-cut"
        legend="Cut at"
        value={cutAt}
        onChange={setCutAt}
        options={[
          { value: "median", label: "The median" },
          { value: "gap", label: "Where median cut cuts" },
        ]}
      />
      <Stepper
        name="gap"
        label="Split"
        min={1}
        max={infos.length}
        value={split}
        valueText={`Split ${split} of ${infos.length}`}
        onChange={setSplit}
      />
      <p className="how-readout" data-readout="gap" aria-live="polite">
        <strong>
          Split {split}, {AXIS_NAMES.rgb[axis]}.
        </strong>{" "}
        The median is {median}. Median cut cuts between {info.lowMax} and{" "}
        {info.highMin}.{" "}
        {moved === 0
          ? "Both positions send the same pixels to each side."
          : `${count(moved)} pixels (${percent(moved, box)} of the box) sit between the two, so a median cut would send them to the other side.`}{" "}
        {wide > 0
          ? `No pixel in the box has a value from ${info.lowMax + 1} to ${info.highMin - 1}. `
          : ""}
        Within 5 values of the median sit {count(nearMedian)} pixels. Within 5
        values of the cut sit {count(nearCut)}.
      </p>
    </>
  );
}

export function PrioritySection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="which-box"
      number={5}
      title="Which box to split"
      photo={data?.name}
      version={data?.version}
      figure={
        data &&
        (splittable(data) ? (
          <PriorityFigure key={data.version} data={data} />
        ) : (
          <TooFlat />
        ))
      }
    >
      <p>
        Seven splits mean seven decisions about which box to cut next. Early on,
        the box with the most pixels goes first. That finds the biggest color
        families before anything else.
      </p>
      <p>
        For the last quarter of the splits, the score is pixel count times
        volume, where volume is the room the box takes up in the color cube. A
        small box spanning a wide range of color, like a bright accent, can then
        beat a big box of near-identical pixels.
      </p>
      <p>
        Choose a split and a ranking to see which box wins. The tag shows which
        rule the quantizer really used at that point.
      </p>
    </Section>
  );
}

const RULE_LABELS: Record<SplitRule, string> = {
  population: "Population",
  volume: "Population times volume",
};

const CUBE = 256 ** 3;

function PriorityFigure({ data }: { data: PageData }) {
  const { infos, run } = useSplits(data);
  const [split, setSplit] = useState(infos.length);
  const [rule, setRule] = useState<SplitRule>("volume");
  const info = infos[split - 1];
  const step = run.steps[split - 1];
  const scores = scoreBoxes(step, rule);
  const winner = pickBox(scores);
  const other = rule === "volume" ? "population" : "volume";
  const otherWinner = pickBox(scoreBoxes(step, other));
  const top = Math.max(...scores.map((s) => s.score ?? 0), 1);
  return (
    <>
      <ol className="how-boxes" aria-label={`Boxes before split ${split}`}>
        {scores.map((box) => (
          <li
            key={box.index}
            data-box={box.index + 1}
            data-winner={box.index === winner}
          >
            <Chip color={css(step[box.index].color)} />
            <div className="how-box-body">
              <div className="how-box-top">
                <strong>Box {box.index + 1}</strong>
                {box.index === winner && <em>Goes first</em>}
                {box.index === info.boxIndex && <b>Used here</b>}
              </div>
              <div className="how-bar" aria-hidden="true">
                <span style={{ width: `${((box.score ?? 0) / top) * 100}%` }} />
              </div>
              <span className="how-box-facts">
                {count(box.population)} pixels, volume{" "}
                {Math.max(0.01, (box.volume / CUBE) * 100).toFixed(
                  box.volume / CUBE < 0.1 ? 2 : 1,
                )}
                % of the cube
                {box.score === null && ", can't be split"}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <Choice<SplitRule>
        name="rank"
        legend="Rank boxes by"
        value={rule}
        onChange={setRule}
        options={[
          { value: "population", label: RULE_LABELS.population },
          { value: "volume", label: RULE_LABELS.volume },
        ]}
      />
      <Stepper
        name="which-box"
        label="Split"
        min={1}
        max={infos.length}
        value={split}
        valueText={`Split ${split} of ${infos.length}`}
        onChange={setSplit}
      />
      <p className="how-readout" data-readout="which-box" aria-live="polite">
        <strong>Split {split}.</strong> Ranked by{" "}
        {RULE_LABELS[rule].toLowerCase()}, box {winner + 1} goes first.{" "}
        {winner === otherWinner
          ? `The other ranking agrees.`
          : `Ranked by ${RULE_LABELS[other].toLowerCase()}, box ${otherWinner + 1} would go first.`}{" "}
        The quantizer used {RULE_LABELS[info.rule].toLowerCase()} here and cut
        box {info.boxIndex + 1}.
      </p>
    </>
  );
}
