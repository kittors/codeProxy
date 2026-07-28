/**
 * Image model selection.
 *
 * Owns the projection from the server's channel/model catalog into the selectors
 * the image-generation page renders, so the page holds no knowledge of which
 * providers or models exist.
 */
export { ImageModelPicker } from "./ImageModelPicker";
export {
  buildImageModelCatalog,
  findImageModel,
  modelLabel,
  providerLabel,
  resolveInitialModel,
  resolveInitialProvider,
  supportsImageEditing,
} from "./imageModels";
export type { ImageModelCatalog, ImageProviderOption } from "./imageModels";
