import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@code-proxy/api-client";
import { toast } from "@code-proxy/ui";

export function useAuthFilesWarmup() {
  const { t } = useTranslation();
  const [warmupPolicyModalOpen, setWarmupPolicyModalOpen] = useState(false);
  const [batchWarmupBusy, setBatchWarmupBusy] = useState(false);

  const handleBatchWarmup = useCallback(
    async (names: string[]) => {
      if (batchWarmupBusy || names.length === 0) return;
      setBatchWarmupBusy(true);
      try {
        const res = await authFilesApi.runWarmupBatch(names);
        toast.success(
          t("antigravity_quota.warmup_batch_success", { count: res.dispatched || names.length }),
        );
      } catch (err: unknown) {
        toast.error(
          t("antigravity_quota.warmup_batch_failed", {
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setBatchWarmupBusy(false);
      }
    },
    [batchWarmupBusy, t],
  );

  return {
    warmupPolicyModalOpen,
    setWarmupPolicyModalOpen,
    batchWarmupBusy,
    handleBatchWarmup,
  };
}
