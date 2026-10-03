import type { RecolorModel } from "./math";

/** Paints the recolored photo into a canvas, either on the GPU or the CPU. */
export interface LayerRenderer {
  /** Shows the photo recolored by `model`; null shows it as it is. */
  draw(model: RecolorModel | null): void;
  /** The canvas changed size. */
  resize(): void;
  destroy(): void;
}
