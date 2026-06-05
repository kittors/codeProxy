import { apiClient } from "../client/client";

export const versionApi = {
  checkLatest: () => apiClient.get<Record<string, unknown>>("/latest-version"),
};
