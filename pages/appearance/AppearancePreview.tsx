import { useTranslation } from "react-i18next";
import { Activity, Database, KeyRound, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Button, Card, DialogIcon, PlanBadge, ProviderTag } from "@code-proxy/ui";
import { QuotaBar } from "@features/quota-preview/QuotaBar";
import { LevelPill } from "@features/monitor-widgets/monitorVisuals";

/*
 * 外观页右侧的实时预览：用的都是真组件（DialogIcon、QuotaBar、LevelPill、PlanBadge……），
 * 不是示意图——它们和全站一样读 <html> 上的外观开关和变量，改设置时这里同步变化，
 * 看到的就是页面里会出现的样子。
 */
const PREVIEW_ICONS = [UsersRound, Activity, ShieldCheck, KeyRound, Database, Sparkles] as const;

export function AppearancePreview() {
  const { t } = useTranslation();
  return (
    <Card title={t("appearance.preview_title")} description={t("appearance.preview_description")}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {PREVIEW_ICONS.map((Icon, index) => (
            <DialogIcon key={index} size="sm">
              <Icon />
            </DialogIcon>
          ))}
        </div>

        <div className="space-y-3">
          <QuotaBar label={t("appearance.preview_quota_5h")} percent={86} detailText="2h 14m" />
          <QuotaBar label={t("appearance.preview_quota_week")} percent={41} detailText="3d 6h" />
          <QuotaBar label={t("appearance.preview_quota_month")} percent={9} detailText="12d" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LevelPill level="normal">{t("appearance.preview_success")}</LevelPill>
          <LevelPill level="warn">{t("appearance.preview_warning")}</LevelPill>
          <LevelPill level="critical">{t("appearance.preview_danger")}</LevelPill>
          <ProviderTag vendor="codex" withLogo>
            codex
          </ProviderTag>
          <PlanBadge vendor="codex" tier="ultra">
            {t("appearance.preview_plan")}
          </PlanBadge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm">
            {t("appearance.preview_primary")}
          </Button>
          <Button size="sm">{t("appearance.preview_secondary")}</Button>
        </div>
      </div>
    </Card>
  );
}
