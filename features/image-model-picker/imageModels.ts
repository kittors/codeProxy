import type {
  ImageGenerationChannelsResponse,
  ImageGenerationModel,
} from "@code-proxy/api-client";

/**
 * Model and provider selection for image generation.
 *
 * The server is the authority on which models exist and which credential pool
 * serves each one. Nothing here hardcodes a model id or a provider name: the page
 * used to assume gpt-image-2 on codex, which is exactly why Grok models stayed
 * unreachable after the runtime could already serve them.
 */

/** A provider with the channels and models available to the current tenant. */
export interface ImageProviderOption {
  provider: string;
  channels: string[];
  models: ImageGenerationModel[];
}

/** Everything the page needs to render its selectors. */
export interface ImageModelCatalog {
  providers: ImageProviderOption[];
  models: ImageGenerationModel[];
  /** True when the server predates provider-aware responses. */
  legacy: boolean;
}

/**
 * Human labels for known providers. An unknown provider falls back to its raw id
 * rather than being hidden, so a provider added server-side is still usable before
 * the panel ships a label for it.
 */
const PROVIDER_LABELS: Record<string, string> = {
  codex: "Codex",
  xai: "Grok",
};

export const providerLabel = (provider: string) =>
  PROVIDER_LABELS[provider.trim().toLowerCase()] ?? provider;

export const modelLabel = (model: ImageGenerationModel) =>
  model.display_name?.trim() || model.id;

/**
 * Projects a channels response into the catalog the UI renders.
 *
 * A server that only sends the legacy `{model, channels}` shape still produces a
 * usable single-provider catalog, so the panel can be deployed before or after the
 * backend without a broken page in between.
 */
export const buildImageModelCatalog = (
  response: ImageGenerationChannelsResponse | null,
): ImageModelCatalog => {
  if (!response) return { providers: [], models: [], legacy: false };

  const models = response.models ?? [];
  const providers = response.providers ?? [];

  if (models.length === 0 || providers.length === 0) {
    const fallbackModel = response.model?.trim();
    if (!fallbackModel) return { providers: [], models: [], legacy: true };
    // The legacy shape names no provider. It is left blank rather than guessed at:
    // the page only needs it to group channels, and inventing "codex" here would
    // start lying the moment another provider is added server-side.
    const legacyModel: ImageGenerationModel = {
      id: fallbackModel,
      provider: "",
      supports_edit: true,
    };
    return {
      providers: [{ provider: "", channels: response.channels ?? [], models: [legacyModel] }],
      models: [legacyModel],
      legacy: true,
    };
  }

  const usable = providers
    .map((entry) => ({
      provider: entry.provider,
      channels: entry.channels ?? [],
      models: models.filter((model) => model.provider === entry.provider),
    }))
    // A provider with no usable channel cannot serve a request, so offering its
    // models would only produce a confusing failure at submit time.
    .filter((entry) => entry.channels.length > 0 && entry.models.length > 0);

  return {
    providers: usable,
    models: usable.flatMap((entry) => entry.models),
    legacy: false,
  };
};

/**
 * Picks the provider to select initially, preferring one the caller used before.
 */
export const resolveInitialProvider = (
  catalog: ImageModelCatalog,
  preferred?: string | null,
) => {
  if (catalog.providers.length === 0) return "";
  const match = catalog.providers.find((entry) => entry.provider === preferred?.trim());
  return (match ?? catalog.providers[0]).provider;
};

/** Picks the model to select within a provider, preferring one used before. */
export const resolveInitialModel = (
  catalog: ImageModelCatalog,
  provider: string,
  preferred?: string | null,
) => {
  const entry = catalog.providers.find((item) => item.provider === provider);
  const models = entry?.models ?? catalog.models;
  if (models.length === 0) return "";
  const match = models.find((model) => model.id === preferred?.trim());
  return (match ?? models[0]).id;
};

export const findImageModel = (catalog: ImageModelCatalog, modelID: string) =>
  catalog.models.find((model) => model.id === modelID) ?? null;

/**
 * Whether a reference-image control should be offered for a model.
 *
 * Driven by the server's declared capability rather than by the model id, because
 * offering an edit form for a text-to-image-only model produces an upstream 404
 * instead of a useful error.
 */
export const supportsImageEditing = (catalog: ImageModelCatalog, modelID: string) =>
  findImageModel(catalog, modelID)?.supports_edit ?? false;
