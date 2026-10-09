import { useTranslation } from "react-i18next";
import { Activity, Database, KeyRound, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Button, DialogIcon, PlanBadge, ProviderTag } from "@code-proxy/ui";
import { QuotaBar } from "@features/quota-preview/QuotaBar";
import { LevelPill } from "@features/monitor-widgets/monitorVisuals";

/*
 * 外观抽屉顶部的实时预览：用的都是真组件（DialogIcon、QuotaBar、LevelPill、PlanBadge……），
 * 不是示意图——它们和全站一样读 <html> 上的外观开关和变量，改设置时这里同步变化，看到的就是
 * 页面里会出现的样子。抽屉本身已是一层面板，预览只用一块淡底，不再套卡片。
 */
const PREVIEW_ICONS = [UsersRound, Activity, ShieldCheck, KeyRound, Database, Sparkles] as const;

export function AppearancePreview() {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("appearance.preview_title")}
      data-testid="appearance-preview"
      className="space-y-4 rounded-2xl bg-subtle p-4"
    >
      <div className="flex flex-wrap gap-1.5">
        {PREVIEW_ICONS.map((Icon, index) => (
          <DialogIcon key={index} size="sm">
            <Icon />
          </DialogIcon>
        ))}
      </div>

      <div className="space-y-2.5">
        <QuotaBar label={t("appearance.preview_quota_5h")} percent={86} detailText="2h 14m" />
        <QuotaBar label={t("appearance.preview_quota_week")} percent={41} detailText="3d 6h" />
        <QuotaBar label={t("appearance.preview_quota_month")} percent={9} detailText="12d" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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
  );
}
