import { apiClient } from "@/lib/http/client";

export const quotaApi = {
  reconcile: async (authIndex: string) =>
    apiClient.post("/quota/reconcile", {
      authIndex,
    }),
};
