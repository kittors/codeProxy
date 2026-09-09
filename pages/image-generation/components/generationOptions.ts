/**
 * Selectable request options for the image generation page.
 *
 * These are plain choice lists with no dependency on page state, extracted so the
 * page component can keep shrinking under the file size gate — it is already over
 * the limit and may only get smaller.
 */

export const DEFAULT_SIZE_OPTION = "1024x1024";

export const SIZE_OPTIONS = [
  DEFAULT_SIZE_OPTION,
  "1792x1024",
  "1024x1792",
  "2560x1440",
  "2160x3840",
] as const;

export const DEFAULT_SIZE_OPTIONS = new Set<string>(SIZE_OPTIONS);

/**
 * Quality levels offered by the picker.
 *
 * xhigh, max and auto arrived with GPT Image 2.5. The server accepts all six and
 * leaves it to the upstream endpoint to decide what it honours, so the picker
 * offers the same set rather than a narrower one the server would have allowed.
 */
export const QUALITY_OPTIONS = ["low", "medium", "high", "xhigh", "max", "auto"] as const;

export type QualityOption = (typeof QUALITY_OPTIONS)[number];

export const DEFAULT_QUALITY: QualityOption = "medium";

export const COUNT_OPTIONS = [1, 2, 3, 4] as const;

export const MAX_UPLOAD_IMAGES = 5;

export const IMAGE_GENERATION_SIZE_PATTERN = /^[1-9]\d*x[1-9]\d*$/;

export const IMAGE_GENERATION_MAX_SIZE_EDGE = 8192;

export const IMAGE_GENERATION_MAX_SIZE_PIXELS =
  IMAGE_GENERATION_MAX_SIZE_EDGE * IMAGE_GENERATION_MAX_SIZE_EDGE;
