import { apiClient } from "@/lib/http/client";

export const ampcodeApi = {
  getAmpcode: () => apiClient.get<Record<string, unknown>>("/ampcode"),
  updateUpstreamUrl: (url: string) => apiClient.put("/ampcode/upstream-url", { value: url }),
  clearUpstreamUrl: () => apiClient.delete("/ampcode/upstream-url"),
  updateUpstreamApiKey: (apiKey: string) =>
    apiClient.put("/ampcode/upstream-api-key", { value: apiKey }),
  clearUpstreamApiKey: () => apiClient.delete("/ampcode/upstream-api-key"),
  getModelMappings: async (): Promise<unknown[]> => {
    const data = await apiClient.get<Record<string, unknown>>("/ampcode/model-mappings");
    const list = data?.["model-mappings"] ?? data?.modelMappings ?? data?.items ?? data;
    return Array.isArray(list) ? list : [];
  },
  saveModelMappings: (mappings: unknown[]) =>
    apiClient.put("/ampcode/model-mappings", { value: mappings }),
  patchModelMappings: (mappings: unknown[]) =>
    apiClient.patch("/ampcode/model-mappings", { value: mappings }),
  clearModelMappings: () => apiClient.delete("/ampcode/model-mappings"),
  deleteModelMappings: (fromList: string[]) =>
    apiClient.delete("/ampcode/model-mappings", { value: fromList }),
  updateForceModelMappings: (enabled: boolean) =>
    apiClient.put("/ampcode/force-model-mappings", { value: enabled }),
};
