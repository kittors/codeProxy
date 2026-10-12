import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { quotaApi, type AuthFileItem } from "@code-proxy/api-client";
import { normalizeAuthIndexValue, resolveAuthFileDisplayName } from "@code-proxy/domain";
import { useToast } from "@code-proxy/ui";
import { consumeCodexResetCredit, type QuotaProvider } from "@features/quota-preview/quota-fetch";
import type { QuotaState } from "@features/quota-preview/quota-helpers";
import type { AuthFilesConfirmAction } from "../components/AuthFilesConfirmModal";

/**
 * 单个账号上的两个运维动作：消耗一次 Codex 重置次数（先确认）、清除账号的错误状态。
 *
 * 从 AuthFilesPage 原样搬出：页面在行数棘轮基线上只能变小，这两段与页面其它状态无关。
 */
export function useAuthFilesCredentialActions({
  quotaByFileName,
  refreshQuota,
  refreshFilesForItems,
  setConfirm,
}: {
  quotaByFileName: Record<string, QuotaState>;
  refreshQuota: (
    file: AuthFileItem,
    provider: QuotaProvider,
    options?: { showLoading?: boolean },
  ) => Promise<void>;
  refreshFilesForItems: (files: AuthFileItem[]) => Promise<AuthFileItem[]>;
  setConfirm: (action: AuthFilesConfirmAction | null) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [resettingCreditFileName, setResettingCreditFileName] = useState<string | null>(null);
  const [clearingStatusFileName, setClearingStatusFileName] = useState<string | null>(null);

  const requestResetCredit = useCallback(
    (file: AuthFileItem) => {
      const count = quotaByFileName[file.name]?.resetCreditCount ?? 0;
      if (count <= 0) return;
      setConfirm({ type: "resetCredit", file });
    },
    [quotaByFileName, setConfirm],
  );

  const handleResetCredit = useCallback(
    async (file: AuthFileItem) => {
      if (resettingCreditFileName) return;
      const name = resolveAuthFileDisplayName(file) || file.name;
      setResettingCreditFileName(file.name);
      try {
        await consumeCodexResetCredit(file);
        await refreshQuota(file, "codex", { showLoading: true });
        notify({
          type: "success",
          message: t("auth_files.reset_credit_success", { name }),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("common.unknown_error");
        notify({
          type: "error",
          message: t("auth_files.reset_credit_failed", { name, message }),
        });
      } finally {
        setResettingCreditFileName(null);
      }
    },
    [notify, refreshQuota, resettingCreditFileName, t],
  );

  const clearAuthFileStatus = useCallback(
    async (file: AuthFileItem) => {
      if (clearingStatusFileName) return;
      const name = resolveAuthFileDisplayName(file) || file.name;
      const authIndex = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
      if (!authIndex) {
        notify({
          type: "error",
          message: t("auth_files.clear_status_failed", {
            name,
            message: t("auth_files.trend_missing_auth_index"),
          }),
        });
        return;
      }

      setClearingStatusFileName(file.name);
      try {
        await quotaApi.clearStatus(authIndex);
        await refreshFilesForItems([file]);
        notify({
          type: "success",
          message: t("auth_files.clear_status_success", { name }),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("common.unknown_error");
        notify({
          type: "error",
          message: t("auth_files.clear_status_failed", { name, message }),
        });
      } finally {
        setClearingStatusFileName(null);
      }
    },
    [clearingStatusFileName, notify, refreshFilesForItems, t],
  );

  return {
    resettingCreditFileName,
    clearingStatusFileName,
    requestResetCredit,
    handleResetCredit,
    clearAuthFileStatus,
  };
}
