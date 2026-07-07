import {
  apiCallApi,
  authFilesApi,
  getApiCallErrorMessage,
  type ProviderModel,
  type ProviderSimpleConfig,
} from "@code-proxy/api-client";
import {
  hasDisableAllModelsRule,
  normalizeDiscoveredModels,
  stripDisableAllModelsRule,
} from "./providers-helpers";

export type ModelAccessProvider = "opencode-go" | "cline" | "ollama-cloud";

export type DiscoveredProviderModel = { id: string; owned_by?: string };

export const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";

export const isClinePassModelId = (modelId: string): boolean =>
  modelId.trim().toLowerCase().startsWith("cline-pass/");

export const isModelAllowedForProvider = (
  provider: ModelAccessProvider,
  modelId: string,
): boolean =>
  provider === "cline"
    ? isClinePassModelId(modelId)
    : !isClinePassModelId(modelId);

export async function fetchModelAccessCatalog(
  provider: ModelAccessProvider,
): Promise<DiscoveredProviderModel[]> {
  if (provider === "opencode-go") {
    const result = await apiCallApi.request({
      method: "GET",
      url: OPENCODE_GO_MODELS_URL,
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    return normalizeDiscoveredModels(result.body ?? result.bodyText);
  }

  const items = await authFilesApi.getModelDefinitions(provider);
  return normalizeDiscoveredModels({
    data: items.map((item) => ({ ...item, object: "model" })),
  });
}

export function getEffectiveProviderModels(
  provider: ModelAccessProvider,
  item: ProviderSimpleConfig,
  catalog: DiscoveredProviderModel[],
): ProviderModel[] {
  if (hasDisableAllModelsRule(item.excludedModels)) return [];

  const excluded = new Set(
    stripDisableAllModelsRule(item.excludedModels).map((model) =>
      model.toLowerCase(),
    ),
  );
  const configured = (item.models ?? []).filter((model) => {
    const name = model.name?.trim() ?? "";
    return name && isModelAllowedForProvider(provider, name);
  });
  const base =
    configured.length > 0
      ? configured
      : catalog.map((model) => ({ name: model.id }));

  return base.filter((model) => {
    const name = model.name?.trim().toLowerCase() ?? "";
    return name && !excluded.has(name);
  });
}
