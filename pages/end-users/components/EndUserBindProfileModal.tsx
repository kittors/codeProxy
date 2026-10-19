import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client";
import { Button, Callout, Modal } from "@code-proxy/ui";
import { ProfilePicker } from "@features/access-policy";

/**
 * 把选中的一批账号绑定到同一个权限模板。模板是成批管理的入口：逐个打开账号去绑定太繁琐。
 * 整批在一个事务里完成；绑定后这些账号的额度、规则、路由与访问范围都改为跟随模板。
 */
export function EndUserBindProfileModal({
  open,
  count,
  profiles,
  boundCounts,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  profiles: ApiKeyPermissionProfile[];
  boundCounts: ReadonlyMap<string, number>;
  busy: boolean;
  onConfirm: (profileId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [profileId, setProfileId] = useState("");

  useEffect(() => {
    if (open) setProfileId(profiles[0]?.id ?? "");
    // 每次打开时默认选第一个模板。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("access_policy.batch_bind_title", { count })}
      description={t("access_policy.batch_bind_desc")}
      icon={<ShieldCheck />}
      size="md"
      dirty={false}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!profileId} onClick={() => onConfirm(profileId)}>
            {t("access_policy.batch_bind_confirm", { count })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="max-h-[22rem] overflow-y-auto pr-1">
          <ProfilePicker
            profiles={profiles}
            value={profileId}
            onChange={setProfileId}
            boundCounts={boundCounts}
            ariaLabel={t("access_policy.pick_profile")}
            disabled={busy}
          />
        </div>
        <Callout tone="warning">{t("access_policy.batch_bind_consequence")}</Callout>
      </div>
    </Modal>
  );
}
