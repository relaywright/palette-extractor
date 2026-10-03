import { useCallback, useEffect, useRef, useState } from "react";
import { useImageSource, type Source } from "../hooks/useImageSource";
import { loadImage } from "../lib/extract";
import { PALETTE_SIZE, workingSize, MAX_DIMENSION } from "./analysis";
import { AnalysisClient } from "./client";
import { DecisionsSection } from "./DecisionsSection";
import { ReprojectSection } from "./ReprojectSection";
import type { PageData } from "./Section";
import { SamplingSection } from "./SamplingSection";
import { SnapSection } from "./SnapSection";
import { ColorSpaceSection, SpacesSection } from "./SpaceSections";
import { GapSection, PrioritySection, SplitSection } from "./SplitSections";

const SAMPLES: Source[] = [
  { src: "/samples/namib.webp", name: "Golden dunes" },
  { src: "/samples/fern.webp", name: "Forest floor" },
];

const noop = () => {};

/**
 * Draws a photo at the working size and returns its raw pixels, the same
 * way the app prepares them for its worker.
 */
function workingPixels(img: HTMLImageElement) {
  const { width, height } = workingSize(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    MAX_DIMENSION,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(img, 0, 0, width, height);
  return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
}

export default function HowPage() {
  const image = useImageSource({
    initialSource: SAMPLES[0],
    onSourceChosen: noop,
  });
  const { source } = image;
  const [data, setData] = useState<PageData | null>(null);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  // The worker behind the photo on screen. It outlives a failed upload and
  // is replaced only when a new photo has been analyzed.
  const liveClient = useRef<AnalysisClient | null>(null);
  useEffect(
    () => () => {
      liveClient.current?.dispose();
      liveClient.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    let client: AnalysisClient | null = null;
    let adopted = false;
    setBusy(true);
    setFailure(null);
    void (async () => {
      const img = await loadImage(source.src, controller.signal);
      const { width, height, rgba } = workingPixels(img);
      const fresh = (client = new AnalysisClient());
      const result = await fresh.analyze(rgba, width, height, PALETTE_SIZE);
      if (controller.signal.aborted) return;
      adopted = true;
      liveClient.current?.dispose();
      liveClient.current = fresh;
      setData((previous) => ({
        name: source.name,
        img,
        analysis: result.analysis,
        rgba: result.rgba,
        client: fresh,
        version: (previous?.version ?? 0) + 1,
      }));
      setBusy(false);
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setFailure(
        error instanceof Error ? error.message : "Could not read that image.",
      );
      setBusy(false);
    });
    return () => {
      controller.abort();
      if (!adopted) client?.dispose();
    };
  }, [source]);

  const choose = useCallback(
    (sample: Source) => image.chooseSource({ ...sample }),
    [image],
  );
  const error = failure ?? image.error;
  const shown = data?.name ?? source?.name ?? "";

  return (
    <main
      className="how-page"
      data-photo={data?.name}
      data-analysis={data?.version ?? 0}
      data-dragging={image.dragging}
    >
      <header className="how-header">
        <a className="how-back" href="/">
          Back to Palette Extractor
        </a>
        <h1>How median cut works</h1>
        <p>
          Palette Extractor finds a photo&apos;s colors with a quantizer written
          from scratch. This page runs that same code on your photo and shows
          each step. Everything happens in your browser.
        </p>
      </header>

      <div className="how-photo" role="group" aria-label="Choose a photo">
        <div className="how-photo-buttons">
          {SAMPLES.map((sample) => (
            <button
              key={sample.src}
              type="button"
              className="button secondary"
              aria-pressed={source?.src === sample.src}
              onClick={() => choose(sample)}
            >
              {sample.name}
            </button>
          ))}
          <button
            type="button"
            className="button primary"
            onClick={() => image.fileInput.current?.click()}
          >
            Upload your own
          </button>
          <input
            ref={image.fileInput}
            hidden
            type="file"
            accept="image/*"
            aria-label="Upload a photo"
            onChange={(event) => {
              image.loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <p className="how-photo-status" role="status">
          {error ??
            (busy
              ? `Reading ${shown}`
              : `Showing ${shown}. Drop or paste an image to use it instead.`)}
        </p>
      </div>

      <SamplingSection data={data} />
      <ColorSpaceSection data={data} />
      <SplitSection data={data} />
      <GapSection data={data} />
      <PrioritySection data={data} />
      <SnapSection data={data} />
      <SpacesSection data={data} />
      <ReprojectSection data={data} />
      <DecisionsSection data={data} />

      <footer className="how-footer">
        <a href="/">Back to Palette Extractor</a>
      </footer>
    </main>
  );
}
