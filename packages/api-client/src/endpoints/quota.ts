import { apiClient } from "../client/client";

export const quotaApi = {
  reconcile: async (authIndex: string) =>
    apiClient.post("/quota/reconcile", {
      authIndex,
    }),
};
