import { useTranslation } from "react-i18next";
import { SettingGroup, SettingRow, ToggleSwitch } from "@code-proxy/ui";
import { ALERT_LIMITS, type AlertDraft } from "./model";
import { NumberField } from "./NumberField";
import type { SaveError } from "./useAlertSettings";

type Rules = AlertDraft["rules"];

/** 「规则」页签：四条规则各自一个开关，阈值的默认值和理由写在字段说明里。 */
export function RulesPanel({
  rules,
  update,
  saveError,
  locked,
}: {
  rules: Rules;
  update: (producer: (current: AlertDraft) => AlertDraft) => void;
  saveError: SaveError | null;
  locked: boolean;
}) {
  const { t } = useTranslation();
  const serverError = (path: string) => (saveError?.field === path ? saveError.message : undefined);
  const set = <K extends keyof Rules>(rule: K, patch: Partial<Rules[K]>) =>
    update((current) => ({
      ...current,
      rules: { ...current.rules, [rule]: { ...current.rules[rule], ...patch } },
    }));

  const toggle = (rule: keyof Rules) => (
    <ToggleSwitch
      id={`alerts-rule-${rule}`}
      checked={rules[rule].enabled}
      disabled={locked}
      onCheckedChange={(enabled) => set(rule, { enabled } as Partial<Rules[typeof rule]>)}
    />
  );

  return (
    <SettingGroup>
      <SettingRow
        label={t("alerts_page.rules.quota_window.label")}
        description={t("alerts_page.rules.quota_window.desc")}
        controlWidth="auto"
        htmlFor="alerts-rule-quota_window"
        control={toggle("quota_window")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("alerts_page.rules.quota_window.threshold")}
            description={t("alerts_page.rules.quota_window.threshold_hint")}
            value={rules.quota_window.threshold}
            onChange={(threshold) => set("quota_window", { threshold })}
            {...ALERT_LIMITS.threshold_percent}
            unit="%"
            disabled={locked || !rules.quota_window.enabled}
            serverError={serverError("rules.quota_window.threshold_percent")}
          />
        </div>
      </SettingRow>

      <SettingRow
        label={t("alerts_page.rules.account_failure.label")}
        description={t("alerts_page.rules.account_failure.desc")}
        controlWidth="auto"
        htmlFor="alerts-rule-account_failure"
        control={toggle("account_failure")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("alerts_page.rules.account_failure.for_minutes")}
            description={t("alerts_page.rules.account_failure.for_minutes_hint")}
            value={rules.account_failure.forMinutes}
            onChange={(forMinutes) => set("account_failure", { forMinutes })}
            {...ALERT_LIMITS.for_minutes}
            unit={t("alerts_page.unit.minutes")}
            disabled={locked || !rules.account_failure.enabled}
            serverError={serverError("rules.account_failure.for_minutes")}
          />
        </div>
      </SettingRow>

      <SettingRow
        label={t("alerts_page.rules.spending.label")}
        description={t("alerts_page.rules.spending.desc")}
        controlWidth="auto"
        htmlFor="alerts-rule-spending"
        control={toggle("spending")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("alerts_page.rules.spending.threshold")}
            description={t("alerts_page.rules.spending.threshold_hint")}
            value={rules.spending.threshold}
            onChange={(threshold) => set("spending", { threshold })}
            {...ALERT_LIMITS.threshold_percent}
            unit="%"
            disabled={locked || !rules.spending.enabled}
            serverError={serverError("rules.spending.threshold_percent")}
          />
        </div>
      </SettingRow>

      <SettingRow
        label={t("alerts_page.rules.use_it_or_lose_it.label")}
        description={t("alerts_page.rules.use_it_or_lose_it.desc")}
        controlWidth="auto"
        htmlFor="alerts-rule-use_it_or_lose_it"
        control={toggle("use_it_or_lose_it")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("alerts_page.rules.use_it_or_lose_it.min_remaining")}
            description={t("alerts_page.rules.use_it_or_lose_it.min_remaining_hint")}
            value={rules.use_it_or_lose_it.minRemaining}
            onChange={(minRemaining) => set("use_it_or_lose_it", { minRemaining })}
            {...ALERT_LIMITS.min_remaining_percent}
            unit="%"
            disabled={locked || !rules.use_it_or_lose_it.enabled}
            serverError={serverError("rules.use_it_or_lose_it.min_remaining_percent")}
          />
          <NumberField
            label={t("alerts_page.rules.use_it_or_lose_it.hours_before_reset")}
            description={t("alerts_page.rules.use_it_or_lose_it.hours_before_reset_hint")}
            value={rules.use_it_or_lose_it.hoursBeforeReset}
            onChange={(hoursBeforeReset) => set("use_it_or_lose_it", { hoursBeforeReset })}
            {...ALERT_LIMITS.hours_before_reset}
            unit={t("alerts_page.unit.hours")}
            disabled={locked || !rules.use_it_or_lose_it.enabled}
            serverError={serverError("rules.use_it_or_lose_it.hours_before_reset")}
          />
        </div>
      </SettingRow>
    </SettingGroup>
  );
}
