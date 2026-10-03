import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisClient } from "./client";

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  posted: { id: number }[] = [];
  failPost = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: { id: number }) {
    if (this.failPost) throw new Error("could not clone");
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

beforeEach(() => {
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnalysisClient", () => {
  it("settles a request with its own reply", async () => {
    const client = new AnalysisClient();
    const asked = client.palette(5);
    const { id } = FakeWorker.last.posted[0];
    FakeWorker.last.reply({ id, kind: "palette", colors: [] });
    await expect(asked).resolves.toEqual([]);
  });

  it("rejects a request made after dispose at once", async () => {
    const client = new AnalysisClient();
    client.dispose();
    expect(FakeWorker.last.terminated).toBe(true);
    await expect(client.palette(5)).rejects.toThrow("cancelled");
    expect(FakeWorker.last.posted).toEqual([]);
  });

  it("rejects the requests still waiting when it is disposed", async () => {
    const client = new AnalysisClient();
    const asked = client.palette(5);
    client.dispose();
    await expect(asked).rejects.toThrow("cancelled");
  });

  it("rejects later requests once the worker has failed", async () => {
    const client = new AnalysisClient();
    const waiting = client.palette(5);
    FakeWorker.last.onerror?.();
    await expect(waiting).rejects.toThrow("could not start");
    await expect(client.palette(6)).rejects.toThrow("could not start");
    expect(FakeWorker.last.posted).toHaveLength(1);
  });

  it("rejects a request the worker cannot receive", async () => {
    const client = new AnalysisClient();
    FakeWorker.last.failPost = true;
    await expect(client.palette(5)).rejects.toThrow("could not clone");
  });
});
