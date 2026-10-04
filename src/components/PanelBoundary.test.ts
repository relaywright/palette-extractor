import { describe, expect, it } from "vitest";
import { ChunkLoadError, tagLoadFailure } from "../lib/lazyPanel";
import { PanelBoundary } from "./PanelBoundary";

describe("a failed import", () => {
  it("is rethrown as a ChunkLoadError that keeps the original error", async () => {
    const original = new TypeError(
      "Failed to fetch dynamically imported module",
    );
    const error = await tagLoadFailure(() => Promise.reject(original)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ChunkLoadError);
    expect((error as ChunkLoadError).cause).toBe(original);
  });

  it("passes a loaded module through untouched", async () => {
    const module = { default: () => null };
    await expect(tagLoadFailure(() => Promise.resolve(module))).resolves.toBe(
      module,
    );
  });
});

describe("what the boundary treats as a load failure", () => {
  const classify = (error: unknown) =>
    PanelBoundary.getDerivedStateFromError(error).failure;

  it("tells a ChunkLoadError from a bug in the part", () => {
    expect(classify(new ChunkLoadError(new Error("offline")))).toBe("load");
    expect(classify(new TypeError("x is undefined"))).toBe("render");
    expect(
      classify(new Error("Failed to fetch dynamically imported module")),
    ).toBe("render");
    expect(classify("a thrown string")).toBe("render");
  });

  it("starts each failure with no newer build found and nothing dismissed", () => {
    const state = PanelBoundary.getDerivedStateFromError(
      new ChunkLoadError(null),
    );
    expect(state.newer).toBe(false);
    expect(state.dismissed).toBe(false);
  });
});
