import { useTranslation } from "react-i18next";
import { ArrowRightLeft } from "lucide-react";
import { Callout, ConfirmModal } from "@code-proxy/ui";
import { ResourceSharingModal } from "@features/resource-sharing";
import type { ProxySharingState } from "./useProxySharing";

/** 系统租户视角的两个弹窗：共享设置、让覆盖了共享代理的租户改用共享版本。 */
export function ProxySharingDialogs({ sharing }: { sharing: ProxySharingState }) {
  const { t } = useTranslation();
  const { sharingTarget, adoptTarget } = sharing;
  const adoptTenants = adoptTarget?.overriddenBy ?? [];
  const adoptBlocked = adoptTarget ? !adoptTarget.enabled : false;

  return (
    <>
      <ResourceSharingModal
        open={sharingTarget !== null}
        kind="proxy"
        resourceName={sharingTarget?.name}
        value={sharingTarget?.sharing ?? null}
        tenants={sharing.tenants.tenants}
        tenantsLoading={sharing.tenants.loading}
        tenantsError={sharing.tenants.error}
        saving={sharing.savingSharing}
        onSave={(input) => void sharing.saveSharing(input)}
        onClose={sharing.closeSharing}
      />

      <ConfirmModal
        open={adoptTarget !== null}
        variant="warning"
        icon={<ArrowRightLeft />}
        title={t("proxies.adopt_title", { name: adoptTarget?.name ?? "" })}
        description={t("proxies.adopt_lead")}
        subject={
          <ul className="space-y-1">
            {adoptTenants.map((tenant) => (
              <li key={tenant.id} className="truncate font-medium">
                {tenant.name}
              </li>
            ))}
          </ul>
        }
        consequences={[
          t("proxies.adopt_consequence_delete", { id: adoptTarget?.id ?? "" }),
          t("proxies.adopt_consequence_accounts"),
        ]}
        confirmText={t("proxies.adopt_confirm")}
        confirmDisabled={adoptBlocked}
        busy={sharing.adopting}
        onClose={sharing.closeAdopt}
        onConfirm={() => void sharing.adopt()}
      >
        {adoptBlocked ? (
          // 后端对停用的共享代理回 409：租户切过去就没有可用的出口了。
          <Callout tone="warning">{t("proxies.adopt_blocked_disabled")}</Callout>
        ) : null}
      </ConfirmModal>
    </>
  );
}
