/**
 * Resolve user-facing model capability tags from OpenRouter/user modalities
 * and model-id name heuristics.
 *
 * Rules:
 * - modality metadata (input/output) is the primary source
 * - model id containing "image" ⇒ image generation
 * - model id containing "video" ⇒ video generation
 * - image/video generation models generally do not expose text unless modalities say so
 */

export type ModelCapabilityKey = "text" | "vision" | "image" | "video" | "audio";

export type ModelCapabilitySource = {
  id?: string;
  inputModalities?: string[] | null;
  outputModalities?: string[] | null;
  supportsVision?: boolean | null;
};

// Keep candidate order aligned with usage.modelPricingLookupModelIDs so
// provider wrappers and variants can reuse their canonical catalog metadata.
export function modelConfigLookupIds(modelId: string): string[] {
  const exact = modelId.trim().toLowerCase();
  if (!exact) return [];

  const candidates = [exact];
  const add = (candidate: string) => {
    const normalized = candidate.trim().toLowerCase();
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  const providerSeparator = exact.indexOf("/");
  if (providerSeparator > 0) add(exact.slice(providerSeparator + 1));

  const variantSeparator = exact.lastIndexOf(":");
  if (variantSeparator > 0) add(exact.slice(0, variantSeparator));

  if (providerSeparator < 0) {
    const prefixSeparator = exact.indexOf("-");
    if (prefixSeparator > 0) add(exact.slice(prefixSeparator + 1));
  }

  return candidates;
}

const CAPABILITY_ORDER: ModelCapabilityKey[] = [
  "text",
  "vision",
  "image",
  "video",
  "audio",
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function modalitySet(values: string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of values ?? []) {
    const token = normalizeToken(String(raw ?? ""));
    if (!token) continue;
    // OpenRouter sometimes uses "file" / "file-data"; keep as-is but map aliases.
    if (token === "vision") {
      out.add("image");
      continue;
    }
    out.add(token);
  }
  return out;
}

function modelIdHint(modelId: string): {
  image: boolean;
  video: boolean;
  audio: boolean;
} {
  const id = normalizeToken(modelId);
  if (!id) {
    return { image: false, video: false, audio: false };
  }

  // User rule: "image" / "video" keywords in the model id are strong signals.
  const image =
    id.includes("image") ||
    id.includes("imagen") ||
    id.includes("dall-e") ||
    id.includes("dalle") ||
    id.includes("flux") ||
    id.includes("midjourney");
  const video =
    id.includes("video") ||
    id.includes("sora") ||
    id.includes("runway") ||
    id.includes("kling") ||
    id.includes("veo");
  const audio =
    id.includes("audio") ||
    id.includes("tts") ||
    id.includes("whisper") ||
    id.includes("speech") ||
    id.includes("voice") ||
    id.includes("realtime");

  return { image, video, audio };
}

/**
 * Derive ordered capability keys for badges on plaza cards / model tables.
 */
export function resolveModelCapabilities(
  source: ModelCapabilitySource,
): ModelCapabilityKey[] {
  const id = String(source.id ?? "").trim();
  const input = modalitySet(source.inputModalities);
  const output = modalitySet(source.outputModalities);
  const hints = modelIdHint(id);

  const hasImageOutput = output.has("image") || hints.image;
  const hasVideoOutput = output.has("video") || hints.video;
  const hasAudio =
    input.has("audio") || output.has("audio") || hints.audio;
  const hasVision =
    source.supportsVision === true ||
    input.has("image") ||
    // pure image-gen still accepts a prompt image in some APIs; keep vision only
    // when input modalities or explicit flag say so (not from name alone).
    false;

  const modalitiesKnown = input.size > 0 || output.size > 0;
  // Image / video generators take a text prompt but are not chat/text models.
  // Only keep "text" when the model also outputs text (multi-capability tools).
  const isMediaGenerator = hasImageOutput || hasVideoOutput;

  let hasText = false;
  if (isMediaGenerator) {
    hasText = output.has("text");
  } else if (input.has("text") || output.has("text")) {
    hasText = true;
  } else if (!modalitiesKnown && !hints.audio) {
    // Default chat models with no metadata still present as text.
    hasText = true;
  }

  const flags: Record<ModelCapabilityKey, boolean> = {
    text: hasText,
    vision: hasVision,
    image: hasImageOutput,
    video: hasVideoOutput,
    audio: hasAudio,
  };

  return CAPABILITY_ORDER.filter((key) => flags[key]);
}

export function modelHasTextCapability(source: ModelCapabilitySource): boolean {
  return resolveModelCapabilities(source).includes("text");
}
