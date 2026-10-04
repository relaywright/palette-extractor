import { recolorPixels, type RecolorModel } from "./math";
import type { LayerRenderer } from "./renderer";

// The same working size the quantizer reads, which keeps a repaint quick
// enough to follow a drag.
const WORKING_SIDE = 320;

/**
 * Recolors a 320 px copy of the photo on a 2D canvas, for browsers without
 * WebGL2. The canvas keeps the photo's proportions and the page crops it
 * like the photo itself. Throws when the photo's pixels cannot be read.
 */
export function createCpuRenderer(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): LayerRenderer {
  const scale = Math.min(
    1,
    WORKING_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const workContext = work.getContext("2d", { willReadFrequently: true })!;
  workContext.drawImage(image, 0, 0, width, height);
  const source = workContext.getImageData(0, 0, width, height);

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  canvas.dataset.recolorMode = "cpu";

  let model: RecolorModel | null = null;
  let frame = 0;
  const paint = () => {
    frame = 0;
    context.putImageData(
      new ImageData(recolorPixels(source.data, model), width, height),
      0,
      0,
    );
    canvas.dataset.recolorDraws = String(
      Number(canvas.dataset.recolorDraws ?? 0) + 1,
    );
  };

  return {
    draw(next) {
      model = next;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    resize() {},
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}
