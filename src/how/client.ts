import type { WeightedColor } from "@relaywright/median-cut";
import type { Analysis } from "./analysis";
import type { AnalysisReply, AnalysisRequest } from "./analysis.worker";

type Reply = Exclude<AnalysisReply, { error: string }>;

type Pending = {
  resolve(reply: Reply): void;
  reject(error: Error): void;
};

/**
 * One worker for the page. Requests settle with their own reply, and the
 * worker answers in order, so a palette asked for after a photo always
 * describes that photo.
 */
export class AnalysisClient {
  private worker: Worker;
  private next = 0;
  private pending = new Map<number, Pending>();
  /** Set once the worker is gone; later requests reject with it at once. */
  private closed: Error | null = null;

  constructor() {
    this.worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<AnalysisReply>) => {
      const waiting = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      if (!waiting) return;
      if ("error" in event.data) waiting.reject(new Error(event.data.error));
      else waiting.resolve(event.data);
    };
    this.worker.onerror = () => this.close("The analysis could not start.");
    this.worker.onmessageerror = () =>
      this.close("The analysis returned something unreadable.");
  }

  private close(message: string) {
    this.closed ??= new Error(message);
    this.worker.terminate();
    for (const waiting of this.pending.values()) waiting.reject(this.closed);
    this.pending.clear();
  }

  private send(
    request: DistributiveOmit<AnalysisRequest, "id">,
    transfer: Transferable[] = [],
  ) {
    return new Promise<Reply>((resolve, reject) => {
      if (this.closed) {
        reject(this.closed);
        return;
      }
      const id = ++this.next;
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ ...request, id }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Analyzes a working image. The pixel buffer goes to the worker without a
   * copy and comes back with the reply, so the page keeps the photo for the
   * dithering figure.
   */
  async analyze(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    count: number,
  ): Promise<{ analysis: Analysis; rgba: Uint8ClampedArray<ArrayBuffer> }> {
    const reply = await this.send(
      {
        kind: "analyze",
        buffer: rgba.buffer as ArrayBuffer,
        width,
        height,
        count,
      },
      [rgba.buffer as ArrayBuffer],
    );
    if (reply.kind !== "analyze") throw new Error("Unexpected reply.");
    return {
      analysis: reply.analysis,
      rgba: new Uint8ClampedArray(reply.buffer),
    };
  }

  async palette(count: number): Promise<WeightedColor[]> {
    const reply = await this.send({ kind: "palette", count });
    if (reply.kind !== "palette") throw new Error("Unexpected reply.");
    return reply.colors;
  }

  dispose() {
    this.close("The analysis was cancelled.");
  }
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;
