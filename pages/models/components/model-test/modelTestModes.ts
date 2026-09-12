import type { ModelTestMode, ModelTestModeInfo, ModelTestOptions } from "@code-proxy/api-client";
import { resolveModelCapabilities } from "@features/model-availability";
import { DEFAULT_MODEL_TEST_PROMPT } from "../../modelsUtils";
import type { ModelItem } from "../../types";

/**
 * Probe modes as the panel presents them.
 *
 * The server is authoritative — it derives the list from the model registry that
 * the /v1/images and /v1/videos endpoints use, so "testable here" and "servable
 * in production" cannot drift. These local definitions cover only labels, icons
 * and the offline fallback below.
 */

export const MODE_LABEL_KEY: Record<ModelTestMode, string> = {
  text: "models_page.test_mode_text",
  vision: "models_page.test_mode_vision",
  image: "models_page.test_mode_image",
  image_edit: "models_page.test_mode_image_edit",
  video: "models_page.test_mode_video",
  video_from_image: "models_page.test_mode_video_from_image",
};

export const MODE_HINT_KEY: Record<ModelTestMode, string> = {
  text: "models_page.test_mode_text_hint",
  vision: "models_page.test_mode_vision_hint",
  image: "models_page.test_mode_image_hint",
  image_edit: "models_page.test_mode_image_edit_hint",
  video: "models_page.test_mode_video_hint",
  video_from_image: "models_page.test_mode_video_from_image_hint",
};

/** Modes whose form needs the image options block. */
export function isImageMode(mode: ModelTestMode): boolean {
  return mode === "image" || mode === "image_edit";
}

/** Modes whose form needs the video options block. */
export function isVideoMode(mode: ModelTestMode): boolean {
  return mode === "video" || mode === "video_from_image";
}

/**
 * Local mode list for a model, used until the server answers and if it cannot.
 *
 * It is derived from the same capability tags the catalog table already shows,
 * so the modal opens on the right tab rather than flashing a chat box at an
 * image model while the request is in flight.
 */
export function fallbackModes(model: ModelItem | null): ModelTestModeInfo[] {
  if (!model) return [];
  const capabilities = resolveModelCapabilities(model);
  if (capabilities.includes("video")) {
    return [
      { mode: "video", default_prompt: "", requires_image: false },
      { mode: "video_from_image", default_prompt: "", requires_image: true },
    ];
  }
  if (capabilities.includes("image")) {
    return [
      { mode: "image", default_prompt: "", requires_image: false },
      { mode: "image_edit", default_prompt: "", requires_image: true },
    ];
  }
  return [
    { mode: "text", default_prompt: DEFAULT_MODEL_TEST_PROMPT, requires_image: false },
    { mode: "vision", default_prompt: "", requires_image: true },
  ];
}

export function resolveModes(
  model: ModelItem | null,
  options: ModelTestOptions | null,
): ModelTestModeInfo[] {
  if (options?.modes?.length) return options.modes;
  return fallbackModes(model);
}

/**
 * Reads a picked file as a data URI.
 *
 * Uploads travel as data URIs rather than multipart so the probe body stays one
 * JSON document all the way to the server, which is also what makes the request
 * snapshot renderable.
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(reader.error?.message ?? "read failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
