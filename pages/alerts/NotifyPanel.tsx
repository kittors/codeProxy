import { useTranslation } from "react-i18next";
import type { AlertLanguage } from "@code-proxy/api-client";
import { Callout, Select, SettingGroup, SettingRow, TextInput, ToggleSwitch } from "@code-proxy/ui";
import { ChannelSection } from "./ChannelSection";
import {
  ALERT_LIMITS,
  FALLBACK_MAX_CHANNELS,
  channelIndexOfField,
  type AlertDraft,
  type ChannelDraft,
  type RangeIssue,
} from "./model";
import type { SaveError } from "./useAlertSettings";
import type { TestOutcome } from "./useChannelTest";

/** 「通知」页签：总开关、消息语言、冷却，以及通知通道。 */
export function NotifyPanel({
  draft,
  update,
  issues,
  saveError,
  locked,
  maxChannels,
  changedChannelKeys,
  testPendingKey,
  testResults,
  onTest,
}: {
  draft: AlertDraft;
  update: (producer: (current: AlertDraft) => AlertDraft) => void;
  issues: Record<string, RangeIssue>;
  saveError: SaveError | null;
  locked: boolean;
  maxChannels: number | undefined;
  changedChannelKeys: ReadonlySet<string>;
  testPendingKey: string | null;
  testResults: Record<string, TestOutcome>;
  onTest: (channel: ChannelDraft) => void;
}) {
  const { t } = useTranslation();
  const cooldownIssue = issues.cooldown_minutes;
  const cooldownError = cooldownIssue
    ? t("alerts_page.range_error", { min: cooldownIssue.min, max: cooldownIssue.max })
    : saveError?.field === "cooldown_minutes"
      ? saveError.message
      : undefined;

  const channelIndex = saveError ? channelIndexOfField(saveError.field) : null;
  const rowErrors = new Map<number, string>(
    channelIndex !== null && saveError ? [[channelIndex, saveError.message]] : [],
  );

  return (
    <div className="space-y-4">
      <SettingGroup>
        <SettingRow
          label={t("alerts_page.master.label")}
          description={t("alerts_page.master.desc")}
          controlWidth="auto"
          htmlFor="alerts-enabled"
          control={
            <ToggleSwitch
              id="alerts-enabled"
              checked={draft.enabled}
              disabled={locked}
              onCheckedChange={(enabled) => update((current) => ({ ...current, enabled }))}
            />
          }
        />
        <SettingRow
          label={t("alerts_page.language.label")}
          description={t("alerts_page.language.desc")}
          controlWidth="sm"
          htmlFor="alerts-language"
          control={
            <Select
              id="alerts-language"
              fullWidth
              disabled={locked}
              value={draft.language}
              onChange={(language) =>
                update((current) => ({ ...current, language: language as AlertLanguage }))
              }
              options={[
                { value: "en", label: t("alerts_page.language.en") },
                { value: "zh-CN", label: t("alerts_page.language.zh") },
              ]}
            />
          }
        />
        <SettingRow
          label={t("alerts_page.cooldown.label")}
          description={t("alerts_page.cooldown.desc", {
            min: ALERT_LIMITS.cooldown_minutes.min,
            max: ALERT_LIMITS.cooldown_minutes.max,
          })}
          controlWidth="sm"
          htmlFor="alerts-cooldown"
          error={cooldownError}
          control={
            <TextInput
              id="alerts-cooldown"
              inputMode="numeric"
              autoComplete="off"
              disabled={locked}
              value={draft.cooldown}
              onChange={(event) =>
                update((current) => ({ ...current, cooldown: event.target.value }))
              }
              endAdornment={
                <span className="pr-1 text-xs text-ink-3">{t("alerts_page.cooldown.unit")}</span>
              }
            />
          }
        />
      </SettingGroup>

      {draft.enabled && !draft.channels.some((channel) => channel.enabled) ? (
        <Callout tone="warning">{t("alerts_page.master.no_channel")}</Callout>
      ) : null}

      <ChannelSection
        channels={draft.channels}
        maxChannels={maxChannels ?? FALLBACK_MAX_CHANNELS}
        disabled={locked}
        changedKeys={changedChannelKeys}
        rowErrors={rowErrors}
        testPendingKey={testPendingKey}
        testResults={testResults}
        onTest={onTest}
        onChange={(channels) => update((current) => ({ ...current, channels }))}
      />
    </div>
  );
}
