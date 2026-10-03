import { describe, expect, it, vi } from "vitest";
import { createGlRenderer, fitsTexture, uploadTexture } from "./gl";

const MAX_TEXTURE_SIZE = 3379;
const NO_ERROR = 0;
const INVALID_VALUE = 0x501;

const photo = (naturalWidth: number, naturalHeight: number) =>
  ({ naturalWidth, naturalHeight }) as HTMLImageElement;

function fakeGl(limit: number, errors: number[] = [], throws = false) {
  const queue = [...errors];
  return {
    MAX_TEXTURE_SIZE,
    NO_ERROR,
    TEXTURE_2D: 1,
    RGBA: 2,
    UNSIGNED_BYTE: 3,
    getParameter: vi.fn((name: number) =>
      name === MAX_TEXTURE_SIZE ? limit : null,
    ),
    getError: vi.fn(() => queue.shift() ?? NO_ERROR),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(() => {
      if (throws) throw new DOMException("tainted", "SecurityError");
    }),
  };
}
const asGl = (gl: unknown) => gl as WebGL2RenderingContext;

describe("texture size", () => {
  it("accepts a photo that fits the limit on both sides", () => {
    expect(fitsTexture(asGl(fakeGl(4096)), photo(4096, 100))).toBe(true);
  });
  it("rejects a photo wider or taller than the limit", () => {
    const gl = asGl(fakeGl(4096));
    expect(fitsTexture(gl, photo(5000, 100))).toBe(false);
    expect(fitsTexture(gl, photo(100, 4097))).toBe(false);
  });
});

describe("texture upload", () => {
  it("reports success when nothing went wrong", () => {
    const gl = fakeGl(4096);
    expect(uploadTexture(asGl(gl), photo(10, 10))).toBe(true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
  });
  it("reports failure when WebGL flags an error instead of throwing", () => {
    const gl = fakeGl(4096, [NO_ERROR, INVALID_VALUE]);
    expect(uploadTexture(asGl(gl), photo(10, 10))).toBe(false);
  });
  it("ignores an error left over from earlier calls", () => {
    // The first getError clears what came before the upload.
    const gl = fakeGl(4096, [INVALID_VALUE, NO_ERROR]);
    expect(uploadTexture(asGl(gl), photo(10, 10))).toBe(true);
  });
  it("reports failure when the photo cannot be read", () => {
    const gl = fakeGl(4096, [], true);
    expect(uploadTexture(asGl(gl), photo(10, 10))).toBe(false);
  });
});

describe("the GPU renderer", () => {
  it("hands an oversized photo to the 2D renderer", () => {
    const gl = fakeGl(4096);
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement;
    expect(createGlRenderer(canvas, photo(9000, 600), () => {})).toBeNull();
    // Nothing was compiled or uploaded for a photo that cannot fit.
    expect(gl.texImage2D).not.toHaveBeenCalled();
  });
});
