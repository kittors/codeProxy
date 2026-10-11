/**
 * The result canvas shared by the image test dialogs: the image generation console
 * and the model catalog probe. It keeps a fixed size and fits every result inside
 * it, so neither dialog is reshaped by what comes back.
 */
export { ImageResultCanvas } from "./ImageResultCanvas";
export type { CanvasImage, CanvasState } from "./ImageResultCanvas";
