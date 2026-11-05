import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi, type AuthFileItem } from "@code-proxy/api-client";
import { normalizeAuthIndexValue, resolveAuthFileDisplayName } from "@code-proxy/domain";
import { useToast } from "@code-proxy/ui";

/** 正在重试的是「哪个账号文件上的哪个模型」；同一个模型名在不同账号上互不影响。 */
export const modelCooldownKey = (fileName: string, model: string): string =>
  `${fileName}\u0000${model}`;

/**
 * 「立即重试」：只清除一个账号上一个模型的冷却，然后重读这个账号，让卡片上的徽章和菜单跟着更新。
 *
 * 成功但 changed=false 说明这个模型在点击之前就已经恢复了（冷却到点、或别处刚清过），照实告诉
 * 用户，而不是报一个并没发生的成功。
 */
export function useAuthFileModelCooldownActions({
  refreshFilesForItems,
}: {
  refreshFilesForItems: (files: AuthFileItem[]) => Promise<AuthFileItem[]>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  // 双击或连点不该发出两次请求：ref 立刻生效，state 只负责让菜单重新渲染。
  const inFlightRef = useRef<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());

  const retryModel = useCallback(
    async (file: AuthFileItem, model: string) => {
      const key = modelCooldownKey(file.name, model);
      if (inFlightRef.current.has(key)) return;
      const name = resolveAuthFileDisplayName(file) || file.name;
      const authIndex = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
      if (!authIndex) {
        notify({
          type: "error",
          message: t("auth_files.cooldown_retry_failed", {
            model,
            name,
            message: t("auth_files.trend_missing_auth_index"),
          }),
        });
        return;
      }

      inFlightRef.current.add(key);
      setRetrying(new Set(inFlightRef.current));
      try {
        const { changed } = await authFilesApi.clearModelCooldown({ authIndex, model });
        await refreshFilesForItems([file]);
        notify({
          type: "success",
          message: t(
            changed ? "auth_files.cooldown_retry_success" : "auth_files.cooldown_retry_nothing",
            { model, name },
          ),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("common.unknown_error");
        notify({
          type: "error",
          message: t("auth_files.cooldown_retry_failed", { model, name, message }),
        });
      } finally {
        inFlightRef.current.delete(key);
        setRetrying(new Set(inFlightRef.current));
      }
    },
    [notify, refreshFilesForItems, t],
  );

  return { retrying, retryModel };
}
