import { apiClient } from "@/lib/http/client";

export const versionApi = {
  checkLatest: () => apiClient.get<Record<string, unknown>>("/latest-version"),
};

