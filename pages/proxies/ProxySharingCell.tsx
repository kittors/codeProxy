import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { SharingStatusBadge, TenantRefsBadge } from "@features/resource-sharing";

/**
 * 系统租户视角的「共享」列：共享给了谁；以及已被授权、却还在用自己同 ID 代理的租户。后者能
 * 管理共享时可以点开，确认后让它们改用共享版本。
 */
export function ProxySharingCell({
  entry,
  tenantNames,
  onAdopt,
}: {
  entry: ProxyPoolEntry;
  tenantNames: ReadonlyMap<string, string>;
  onAdopt?: (entry: ProxyPoolEntry) => void;
}) {
  const { t } = useTranslation();
  const overriddenBy = entry.overriddenBy ?? [];
  if (!entry.sharing && overriddenBy.length === 0) {
    return <span className="text-xs text-ink-3">{t("resource_sharing.not_shared")}</span>;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <SharingStatusBadge sharing={entry.sharing ?? null} tenantNames={tenantNames} />
      <TenantRefsBadge
        tenants={overriddenBy}
        label={t("proxies.overridden_by_badge", { count: overriddenBy.length })}
        lead={onAdopt ? t("proxies.overridden_by_lead_action") : t("proxies.overridden_by_lead")}
        icon={<AlertTriangle size={11} aria-hidden="true" />}
        onClick={onAdopt ? () => onAdopt(entry) : undefined}
        ariaLabel={
          onAdopt
            ? t("proxies.adopt_open", { count: overriddenBy.length, name: entry.name })
            : undefined
        }
        testId="proxy-overridden-by"
      />
    </div>
  );
}
