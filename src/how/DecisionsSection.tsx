import { Section, type PageData } from "./Section";

/** Desktop Node timings for median cut at each working size, in milliseconds. */
const BENCHMARK: { size: number; ms: number; label: string }[] = [
  { size: 160, ms: 33, label: "33 ms" },
  { size: 320, ms: 141, label: "141 ms" },
  { size: 512, ms: 552, label: "552 ms" },
  { size: 800, ms: 2000, label: "about 2 s" },
];

interface Decision {
  id: string;
  title: string;
  chose: string;
  instead: string;
  because: string[];
}

const DECISIONS: Decision[] = [
  {
    id: "320",
    title: "Work at 320 px",
    chose: "Draw the photo with its longest side at 320 pixels.",
    instead: "160 pixels, or 512 and up.",
    because: [
      "At 160 pixels the downscaler blurred fine detail into colors that are not in the photo. At 512 pixels the run took about four times as long as at 320 with no visible gain.",
      "320 pixels gives about four times the pixels of 160 and still finishes well under a second on phone-class hardware.",
    ],
  },
  {
    id: "buffer",
    title: "Move pixels to the worker as a transferred buffer",
    chose:
      "Draw the canvas on the main thread, then transfer its raw pixel buffer to a Web Worker.",
    instead:
      "Copying the pixels, or building one array per pixel on the main thread.",
    because: [
      "A transfer hands the memory over without copying it. The worker filters out transparent pixels and builds the pixel list itself, so the main thread only draws and hands off and the page stays responsive on large photos.",
      "This page does the same, and the worker returns the buffer with its result so the dithering figure can reuse it.",
    ],
  },
  {
    id: "canvas",
    title: "Keep the canvas on the main thread",
    chose: "A regular canvas, drawn before the hand-off.",
    instead: "An OffscreenCanvas inside the worker.",
    because: [
      "OffscreenCanvas resampled the photo to slightly different pixels than the main-thread canvas produced. Different pixels mean different palettes, and the palette should not depend on where the canvas lives.",
    ],
  },
  {
    id: "k-means",
    title: "Median cut, not k-means",
    chose: "Median cut, written from scratch.",
    instead: "k-means clustering.",
    because: [
      "Median cut is deterministic: the same photo and settings give the same palette every time. k-means can return a different palette on each run.",
      "k-means centers are averages, so they can fall between clusters and name colors the photo does not contain. That is the problem the snap in section 6 solves for median cut.",
      "Median cut at 320 pixels took 141 ms in the benchmark above.",
    ],
  },
];

export function DecisionsSection({ data }: { data: PageData | null }) {
  return (
    <Section
      id="decisions"
      number={9}
      title="Decisions and trade-offs"
      photo={data?.name}
      version={data?.version}
      figure={<Decisions />}
    >
      <p>
        Most choices in this app trade a little flexibility for speed and
        predictable results. Four of them shaped what you have just seen.
      </p>
      <p>
        Open any decision to see what was chosen, what was left out, and why.
        The timings come from a benchmark of the quantizer on a desktop machine
        in Node.
      </p>
      <p>
        Median cut is still an approximation. It cuts along one color axis at a
        time, so it cannot follow a diagonal streak of color, and a simple image
        may return fewer colors than you ask for.
      </p>
    </Section>
  );
}

function Decisions() {
  const slowest = Math.max(...BENCHMARK.map((row) => row.ms));
  return (
    <div className="how-decisions">
      {DECISIONS.map((decision, i) => (
        <details key={decision.id} open={i === 0} data-decision={decision.id}>
          <summary>{decision.title}</summary>
          <dl>
            <div>
              <dt>Chose</dt>
              <dd>{decision.chose}</dd>
            </div>
            <div>
              <dt>Instead of</dt>
              <dd>{decision.instead}</dd>
            </div>
            <div>
              <dt>Because</dt>
              <dd>
                {decision.because.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </dd>
            </div>
          </dl>
          {decision.id === "320" && (
            <ul
              className="how-benchmark"
              aria-label="Time to run median cut at each working size"
            >
              {BENCHMARK.map((row) => (
                <li key={row.size}>
                  <span>{row.size} px</span>
                  <span className="how-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.max(2, (row.ms / slowest) * 100)}%`,
                      }}
                    />
                  </span>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}
