import {
  analysisBuffers,
  analyzePixels,
  opaquePixels,
  type Analysis,
} from "./analysis";
import {
  medianCutWeighted,
  type Pixel,
  type WeightedColor,
} from "@relaywright/median-cut";

export type AnalysisRequest =
  | {
      id: number;
      kind: "analyze";
      buffer: ArrayBuffer;
      width: number;
      height: number;
      count: number;
    }
  | { id: number; kind: "palette"; count: number };

export type AnalysisReply =
  | {
      id: number;
      kind: "analyze";
      analysis: Analysis;
      /** The request's pixel buffer, handed back so the page can keep it. */
      buffer: ArrayBuffer;
    }
  | { id: number; kind: "palette"; colors: WeightedColor[] }
  | { id: number; error: string };

// The opaque pixels of the last photo; palette requests reuse them, since
// the photo's own buffer goes back to the page with the reply.
let current: Pixel[] | null = null;

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "analyze") {
      const { raster, tuples } = opaquePixels(
        new Uint8ClampedArray(request.buffer),
      );
      current = tuples;
      const analysis = analyzePixels(
        tuples,
        raster,
        request.width,
        request.height,
        request.count,
      );
      const reply: AnalysisReply = {
        id: request.id,
        kind: "analyze",
        analysis,
        buffer: request.buffer,
      };
      self.postMessage(reply, {
        transfer: [...analysisBuffers(analysis), request.buffer],
      });
    } else {
      if (!current) throw new Error("No photo has been analyzed yet.");
      const reply: AnalysisReply = {
        id: request.id,
        kind: "palette",
        colors: medianCutWeighted(current, request.count),
      };
      self.postMessage(reply);
    }
  } catch (error) {
    const reply: AnalysisReply = {
      id: request.id,
      error:
        error instanceof Error ? error.message : "Could not read that image.",
    };
    self.postMessage(reply);
  }
};
