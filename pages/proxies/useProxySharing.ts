import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResourceSharingCapability, ResourceSharingInput } from "@code-proxy/api-client";
import { proxiesApi, type ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { useToast } from "@code-proxy/ui";
import { formatTenantList, useSharingTenants } from "@features/resource-sharing";

/**
 * 系统租户视角下代理的平台共享：共享设置弹窗与「让覆盖了共享代理的租户改用共享版本」。
 *
 * 只有后端声明 `manageable`（平台管理员处于系统租户视角）时才拉租户目录、给出入口；
 * 其余情况 manageable 为 false，页面不出现任何编辑入口。
 */
export function useProxySharing({
  capability,
  reload,
}: {
  capability: ResourceSharingCapability;
  /** 共享设置或切换完成后重新加载列表（共享状态、覆盖情况都以服务端为准）。 */
  reload: () => Promise<void> | void;
}) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const manageable = capability.supported && capability.manageable;
  const tenants = useSharingTenants(manageable);
  const [sharingTarget, setSharingTarget] = useState<ProxyPoolEntry | null>(null);
  const [savingSharing, setSavingSharing] = useState(false);
  const [adoptTarget, setAdoptTarget] = useState<ProxyPoolEntry | null>(null);
  const [adopting, setAdopting] = useState(false);

  const notifyError = useCallback(
    (error: unknown) =>
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("common.error"),
      }),
    [notify, t],
  );

  const saveSharing = useCallback(
    async (input: ResourceSharingInput) => {
      if (!sharingTarget) return;
      setSavingSharing(true);
      try {
        const sharing = await proxiesApi.updateSharing(sharingTarget.id, input);
        notify({
          type: "success",
          message: sharing
            ? t("proxies.sharing_saved", { name: sharingTarget.name })
            : t("proxies.sharing_cleared", { name: sharingTarget.name }),
        });
        setSharingTarget(null);
        await reload();
      } catch (error) {
        notifyError(error);
      } finally {
        setSavingSharing(false);
      }
    },
    [notify, notifyError, reload, sharingTarget, t],
  );

  const adopt = useCallback(async () => {
    if (!adoptTarget) return;
    setAdopting(true);
    try {
      const switched = await proxiesApi.adopt(adoptTarget.id);
      notify({
        type: "success",
        message:
          switched.length > 0
            ? t("proxies.adopt_done", {
                count: switched.length,
                name: adoptTarget.name,
                tenants: formatTenantList(
                  switched.map((tenant) => tenant.name),
                  i18n.language,
                ),
              })
            : t("proxies.adopt_none", { name: adoptTarget.name }),
      });
      setAdoptTarget(null);
      await reload();
    } catch (error) {
      notifyError(error);
    } finally {
      setAdopting(false);
    }
  }, [adoptTarget, i18n.language, notify, notifyError, reload, t]);

  const closeSharing = useCallback(() => setSharingTarget(null), []);
  const closeAdopt = useCallback(() => setAdoptTarget(null), []);

  return {
    manageable,
    tenants,
    sharingTarget,
    openSharing: setSharingTarget,
    closeSharing,
    savingSharing,
    saveSharing,
    adoptTarget,
    openAdopt: setAdoptTarget,
    closeAdopt,
    adopting,
    adopt,
  };
}

export type ProxySharingState = ReturnType<typeof useProxySharing>;
