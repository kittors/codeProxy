import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NO_ACCESS_POLICY_CAPABILITIES,
  apiKeyEntriesApi,
  endUsersApi,
  type AccessPolicyCapabilities,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import { copyTextToClipboard, useToast } from "@code-proxy/ui";

/**
 * 某个账号名下的 Key：列表、复制、暂停 / 恢复。
 *
 * 复制按需取一把 Key 的明文（后端 owned-key-admin）；旧后端没有这个接口，退回到拉取租户
 * 明文列表再按 id 找——只在点复制时才拉，不再为了「可能要复制」在打开弹窗时就把整个租户的
 * 明文都下载下来。
 */
export function useOwnedKeys(userId: string | null) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [keys, setKeys] = useState<EndUserAPIKey[]>([]);
  const [capabilities, setCapabilities] = useState<AccessPolicyCapabilities>(NO_ACCESS_POLICY_CAPABILITIES);
  const [loading, setLoading] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const result = await endUsersApi.listKeys(userId);
      if (seq !== seqRef.current) return;
      setKeys(result.items);
      setCapabilities(result.capabilities);
    } catch (err) {
      if (seq !== seqRef.current) return;
      notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.load_failed") });
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [notify, t, userId]);

  useEffect(() => {
    setKeys([]);
    if (userId) void load();
  }, [load, userId]);

  /** 取一把 Key 的明文；取不到时返回 null（已提示错误）。 */
  const resolveSecret = useCallback(
    async (key: EndUserAPIKey): Promise<string | null> => {
      if (!userId) return null;
      if (key.key) return key.key;
      try {
        if (capabilities.ownedKeyAdmin) return (await endUsersApi.keySecret(userId, key.id)).key || null;
        const entries = await apiKeyEntriesApi.list();
        return entries.find((entry) => entry.id === key.id)?.key ?? null;
      } catch (err) {
        notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.operation_failed") });
        return null;
      }
    },
    [capabilities.ownedKeyAdmin, notify, t, userId],
  );

  const copy = useCallback(
    async (key: EndUserAPIKey) => {
      setBusyKeyId(key.id);
      try {
        const secret = await resolveSecret(key);
        if (!secret) return;
        notify(
          (await copyTextToClipboard(secret))
            ? { type: "success", message: t("api_keys_page.copied_toast") }
            : { type: "error", message: t("api_keys_page.copy_failed") },
        );
      } finally {
        setBusyKeyId(null);
      }
    },
    [notify, resolveSecret, t],
  );

  const toggleDisabled = useCallback(
    async (key: EndUserAPIKey) => {
      if (!userId) return;
      const next = !key.disabled;
      setBusyKeyId(key.id);
      try {
        // 旧后端的账号 Key 接口不接受 disabled，沿用按 id 修改 Key 条目的做法。
        if (capabilities.ownedKeyAdmin) await endUsersApi.updateKey(userId, key.id, { disabled: next });
        else await apiKeyEntriesApi.update({ id: key.id, value: { disabled: next } });
        notify({
          type: "success",
          message: next
            ? t("api_keys_page.disabled_toast", { name: key.name || t("api_keys_page.unnamed") })
            : t("api_keys_page.enabled_toast", { name: key.name || t("api_keys_page.unnamed") }),
        });
        await load();
      } catch (err) {
        notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.operation_failed") });
      } finally {
        setBusyKeyId(null);
      }
    },
    [capabilities.ownedKeyAdmin, load, notify, t, userId],
  );

  return { keys, capabilities, loading, busyKeyId, setBusyKeyId, load, resolveSecret, copy, toggleDisabled };
}
