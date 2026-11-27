import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { AuthFileItem, AuthFileSubscriptionPeriod } from "@code-proxy/api-client";
import { DateTimePicker, Select } from "@code-proxy/ui";
import { resolveLiveAuthFileSubscription, type PrefixProxyEditorState } from "@code-proxy/domain";
import { describeAuthFileSubscription } from "./AuthFileSubscriptionBadge";

interface AuthFileSubscriptionFieldsProps {
  file: AuthFileItem | null;
  editor: PrefixProxyEditorState;
  setEditor: Dispatch<SetStateAction<PrefixProxyEditorState>>;
}

/**
 * 账号详情里的订阅时间。后端能从上游读到账单周期时（目前是 Codex）只读展示，不再让人手填：
 * 手填的是「开始时间 + 一个周期」，和上游真实的续费日对不上就会算错（2026-11-20 实测差了两天）。
 * 读不到时（其他上游、还没读过、读取失败）照旧手填；已填的手动值保留，作为读不到时的兜底。
 * 从 AuthFileDetailModal 拆出来，那个文件在行数基线里只许变小。
 */
export function AuthFileSubscriptionFields({
  file,
  editor,
  setEditor,
}: AuthFileSubscriptionFieldsProps) {
  const { t, i18n } = useTranslation();
  const live = file ? resolveLiveAuthFileSubscription(file) : null;

  if (live) {
    return (
      <div className="grid gap-2">
        <p className="text-xs font-semibold text-sn-label2">
          {t("auth_files.subscription_live_label")}
        </p>
        <p className="text-sm text-sn-label">{describeAuthFileSubscription(live, t)}</p>
        <p className="text-xs text-sn-label3">{t("auth_files.subscription_live_hint")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold text-sn-label2">
        {t("auth_files.subscription_started_at_label")}
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <DateTimePicker
          value={editor.subscriptionStartedAt}
          onChange={(value) => {
            setEditor((prev) => ({
              ...prev,
              subscriptionStartedAt: value,
            }));
          }}
          aria-label={t("auth_files.subscription_started_at_label")}
          locale={i18n.language}
          labels={{
            picker: t("auth_files.subscription_date_picker"),
            open: t("auth_files.subscription_date_picker_open"),
            previousMonth: t("auth_files.subscription_date_picker_previous_month"),
            nextMonth: t("auth_files.subscription_date_picker_next_month"),
            today: t("auth_files.subscription_date_picker_today"),
            clear: t("auth_files.subscription_date_picker_clear"),
            hour: t("auth_files.subscription_date_picker_hour"),
            minute: t("auth_files.subscription_date_picker_minute"),
          }}
        />
        <Select
          value={editor.subscriptionPeriod}
          onChange={(value) =>
            setEditor((prev) => ({
              ...prev,
              subscriptionPeriod: value as AuthFileSubscriptionPeriod,
            }))
          }
          options={[
            {
              value: "monthly",
              label: t("auth_files.subscription_period_monthly"),
            },
            {
              value: "yearly",
              label: t("auth_files.subscription_period_yearly"),
            },
          ]}
          aria-label={t("auth_files.subscription_period_label")}
        />
      </div>
      <p className="text-xs text-sn-label3">{t("auth_files.subscription_started_at_hint")}</p>
    </div>
  );
}
