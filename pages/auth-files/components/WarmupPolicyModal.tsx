import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Flame, Repeat, Search, UserMinus } from "lucide-react";
import {
  Button,
  Callout,
  Checkbox,
  CheckboxField,
  FormField,
  FormSection,
  Modal,
  SettingRow,
  Skeleton,
  TextInput,
  ToggleSwitch,
  toast,
} from "@code-proxy/ui";
import { authFilesApi } from "@code-proxy/api-client";
import { fromLocalInputValue, toLocalInputValue } from "./warmupTime";

interface WarmupPolicyModalProps {
  open: boolean;
  onClose: () => void;
  allFileNames: string[];
}

type WarmupPolicyResponse = {
  enabled?: boolean;
  start_at?: string;
  stop_at?: string;
  daily_window?: {
    enabled?: boolean;
    start_hour?: number;
    start_minute?: number;
    end_hour?: number;
    end_minute?: number;
  };
  interval_seconds?: number;
  stagger_minutes?: number;
  providers?: string[];
  excluded_auth_ids?: string[];
};

const FORM_ID = "warmup-policy-form";

/**
 * 额度预热与错峰策略。
 *
 * 两处以前会悄悄出错的地方：
 * - 读取失败以前被吞掉，表单停在默认值上，用户一保存就把服务器上的真实策略覆盖成默认值。
 *   现在读取失败会提示并禁止保存，可以重试。
 * - 开始 / 截止时间以前按 UTC 填进「本地时间」输入框，保存时又按本地时间解析，
 *   东八区每保存一次就往前挪 8 小时。现在读写都按本地时间换算（warmupTime.ts）。
 */
export function WarmupPolicyModal({ open, onClose, allFileNames }: WarmupPolicyModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [enabled, setEnabled] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [stopAt, setStopAt] = useState("");
  const [dailyWindowEnabled, setDailyWindowEnabled] = useState(true);
  const [dailyStart, setDailyStart] = useState("07:00");
  const [dailyEnd, setDailyEnd] = useState("23:00");
  const [intervalHours, setIntervalHours] = useState("5");
  const [staggerMinutes, setStaggerMinutes] = useState("15");
  const [targetAntigravity, setTargetAntigravity] = useState(true);
  const [targetCodex, setTargetCodex] = useState(true);
  const [excludedAuthIds, setExcludedAuthIds] = useState<string[]>([]);
  const [accountQuery, setAccountQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError("");
    authFilesApi
      .getWarmupPolicies()
      .then((res) => {
        const policies = res.policies as WarmupPolicyResponse[] | undefined;
        const p = policies?.[0];
        if (!p) return;
        setEnabled(p.enabled ?? true);
        setStartAt(p.start_at ? toLocalInputValue(p.start_at) : "");
        setStopAt(p.stop_at ? toLocalInputValue(p.stop_at) : "");
        if (p.daily_window) {
          setDailyWindowEnabled(p.daily_window.enabled ?? true);
          const sh = String(p.daily_window.start_hour ?? 7).padStart(2, "0");
          const sm = String(p.daily_window.start_minute ?? 0).padStart(2, "0");
          const eh = String(p.daily_window.end_hour ?? 23).padStart(2, "0");
          const em = String(p.daily_window.end_minute ?? 0).padStart(2, "0");
          setDailyStart(`${sh}:${sm}`);
          setDailyEnd(`${eh}:${em}`);
        }
        if (p.interval_seconds) setIntervalHours(String(Math.round(p.interval_seconds / 3600)));
        if (p.stagger_minutes) setStaggerMinutes(String(p.stagger_minutes));
        if (Array.isArray(p.providers)) {
          setTargetAntigravity(p.providers.includes("antigravity"));
          setTargetCodex(p.providers.includes("codex"));
        }
        if (Array.isArray(p.excluded_auth_ids)) setExcludedAuthIds(p.excluded_auth_ids);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setLoading(false));
  }, [open, reloadKey]);

  const handleSave = useCallback(async () => {
    if (loading || loadError) return;
    setSaving(true);
    try {
      const providers: string[] = [];
      if (targetAntigravity) providers.push("antigravity");
      if (targetCodex) providers.push("codex");

      const [startHour, startMin] = dailyStart.split(":").map(Number);
      const [endHour, endMin] = dailyEnd.split(":").map(Number);

      const policyPayload: Record<string, unknown> = {
        id: "default-quota-warmup",
        name: "Default Quota Warmup Policy",
        enabled,
        providers,
        interval_seconds: Math.max(1, Number(intervalHours) || 5) * 3600,
        stagger_minutes: Math.max(1, Number(staggerMinutes) || 15),
        excluded_auth_ids: excludedAuthIds,
        daily_window: {
          enabled: dailyWindowEnabled,
          start_hour: startHour ?? 7,
          start_minute: startMin ?? 0,
          end_hour: endHour ?? 23,
          end_minute: endMin ?? 0,
        },
      };

      const start = fromLocalInputValue(startAt);
      const stop = fromLocalInputValue(stopAt);
      if (start) policyPayload.start_at = start;
      if (stop) policyPayload.stop_at = stop;

      await authFilesApi.saveWarmupPolicy(policyPayload);
      toast.success(t("antigravity_quota.warmup_policy_saved"));
      onClose();
    } catch (e: unknown) {
      toast.error(t("antigravity_quota.warmup_policy_save_failed", { message: String(e) }));
    } finally {
      setSaving(false);
    }
  }, [
    dailyEnd,
    dailyStart,
    dailyWindowEnabled,
    enabled,
    excludedAuthIds,
    intervalHours,
    loadError,
    loading,
    onClose,
    staggerMinutes,
    startAt,
    stopAt,
    t,
    targetAntigravity,
    targetCodex,
  ]);

  const toggleExcludeAccount = (name: string) => {
    setExcludedAuthIds((prev) =>
      prev.includes(name) ? prev.filter((id) => id !== name) : [...prev, name],
    );
  };

  const visibleAccounts = useMemo(() => {
    const query = accountQuery.trim().toLowerCase();
    return query ? allFileNames.filter((name) => name.toLowerCase().includes(query)) : allFileNames;
  }, [accountQuery, allFileNames]);

  const disabled = loading || saving || Boolean(loadError);
  const unit = (key: string) => (
    <span className="pr-2 text-xs text-ink-3 select-none">{t(key)}</span>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("antigravity_quota.warmup_policy_title")}
      description={t("antigravity_quota.warmup_policy_desc")}
      icon={<Flame />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            loading={saving}
            disabled={loading || Boolean(loadError)}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      {loadError ? (
        <Callout
          tone="danger"
          role="alert"
          className="mb-5"
          title={t("antigravity_quota.warmup_load_failed_title")}
          actions={
            <Button size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              {t("common.retry", { defaultValue: "重试" })}
            </Button>
          }
        >
          {t("antigravity_quota.warmup_load_failed_desc", { message: loadError })}
        </Callout>
      ) : null}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : (
        <form
          id={FORM_ID}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          {/* 弹窗里不用 SettingGroup（它是带细边和投影的卡片）：设置行放在一层无边淡底里。 */}
          <div className="overflow-hidden rounded-2xl bg-subtle">
            <SettingRow
              label={t("antigravity_quota.warmup_policy_enabled")}
              description={t("antigravity_quota.warmup_tooltip")}
              controlWidth="auto"
              control={
                <ToggleSwitch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={disabled}
                  ariaLabel={t("antigravity_quota.warmup_policy_enabled")}
                />
              }
            />
          </div>

          <FormSection
            title={t("antigravity_quota.warmup_target_providers")}
            description={t("antigravity_quota.warmup_targets_desc")}
            icon={<Flame />}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <CheckboxField
                checked={targetAntigravity}
                onCheckedChange={setTargetAntigravity}
                disabled={disabled}
                label="Antigravity"
                description={t("antigravity_quota.warmup_target_antigravity_desc")}
              />
              <CheckboxField
                checked={targetCodex}
                onCheckedChange={setTargetCodex}
                disabled={disabled}
                label="Codex"
                description={t("antigravity_quota.warmup_target_codex_desc")}
              />
            </div>
          </FormSection>

          <FormSection
            title={t("antigravity_quota.warmup_rhythm_title")}
            description={t("antigravity_quota.warmup_rhythm_desc")}
            icon={<Repeat />}
          >
            <div className="grid gap-x-4 sm:grid-cols-2">
              <FormField
                label={t("antigravity_quota.warmup_interval_label")}
                description={t("antigravity_quota.warmup_interval_hint")}
                reserveMeta={false}
              >
                <TextInput
                  type="number"
                  min="1"
                  max="72"
                  value={intervalHours}
                  disabled={disabled}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  endAdornment={unit("antigravity_quota.unit_hours")}
                />
              </FormField>
              <FormField
                label={t("antigravity_quota.warmup_stagger_label")}
                description={t("antigravity_quota.warmup_stagger_hint")}
                reserveMeta={false}
              >
                <TextInput
                  type="number"
                  min="1"
                  max="120"
                  value={staggerMinutes}
                  disabled={disabled}
                  onChange={(e) => setStaggerMinutes(e.target.value)}
                  endAdornment={unit("antigravity_quota.unit_minutes")}
                />
              </FormField>
            </div>
            <div className="overflow-hidden rounded-2xl bg-subtle">
              <SettingRow
                label={t("antigravity_quota.warmup_daily_window_enable")}
                description={t("antigravity_quota.warmup_daily_window_desc")}
                controlWidth="auto"
                control={
                  <ToggleSwitch
                    checked={dailyWindowEnabled}
                    onCheckedChange={setDailyWindowEnabled}
                    disabled={disabled}
                    ariaLabel={t("antigravity_quota.warmup_daily_window_enable")}
                  />
                }
              >
                {dailyWindowEnabled ? (
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <FormField label={t("antigravity_quota.warmup_daily_start")} reserveMeta={false}>
                      <TextInput
                        type="time"
                        value={dailyStart}
                        disabled={disabled}
                        onChange={(e) => setDailyStart(e.target.value)}
                      />
                    </FormField>
                    <FormField label={t("antigravity_quota.warmup_daily_end")} reserveMeta={false}>
                      <TextInput
                        type="time"
                        value={dailyEnd}
                        disabled={disabled}
                        onChange={(e) => setDailyEnd(e.target.value)}
                      />
                    </FormField>
                  </div>
                ) : null}
              </SettingRow>
            </div>
          </FormSection>

          <FormSection
            title={t("antigravity_quota.warmup_schedule_title")}
            description={t("antigravity_quota.warmup_schedule_desc")}
            icon={<CalendarClock />}
          >
            <div className="grid gap-x-4 sm:grid-cols-2">
              <FormField
                label={t("antigravity_quota.warmup_start_label")}
                description={t("antigravity_quota.warmup_start_hint")}
                reserveMeta={false}
              >
                <TextInput
                  type="datetime-local"
                  value={startAt}
                  disabled={disabled}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </FormField>
              <FormField
                label={t("antigravity_quota.warmup_stop_label")}
                description={t("antigravity_quota.warmup_stop_hint")}
                optional
                reserveMeta={false}
              >
                <TextInput
                  type="datetime-local"
                  value={stopAt}
                  disabled={disabled}
                  onChange={(e) => setStopAt(e.target.value)}
                />
              </FormField>
            </div>
          </FormSection>

          {allFileNames.length > 0 ? (
            <FormSection
              title={t("antigravity_quota.warmup_exclude_title")}
              description={t("antigravity_quota.warmup_exclude_desc")}
              icon={<UserMinus />}
              actions={
                <span className="text-xs text-ink-3 tabular-nums">
                  {t("antigravity_quota.warmup_exclude_count", {
                    excluded: excludedAuthIds.length,
                    total: allFileNames.length,
                  })}
                </span>
              }
            >
              {/* 一层无边淡底装下搜索框和账号列表，不再描边、也不再用分隔线切开。 */}
              <div className="overflow-hidden rounded-2xl bg-subtle">
                {allFileNames.length > 6 ? (
                  <div className="p-2 pb-0.5">
                    <TextInput
                      size="sm"
                      value={accountQuery}
                      onChange={(e) => setAccountQuery(e.currentTarget.value)}
                      placeholder={t("antigravity_quota.warmup_exclude_search")}
                      aria-label={t("antigravity_quota.warmup_exclude_search")}
                      startAdornment={<Search size={14} className="text-ink-3" aria-hidden="true" />}
                      data-dismiss-safe=""
                    />
                  </div>
                ) : null}
                <div className="max-h-48 space-y-0.5 overflow-y-auto p-1.5">
                  {visibleAccounts.map((name) => {
                    const excluded = excludedAuthIds.includes(name);
                    return (
                      <label
                        key={name}
                        className={[
                          "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                          excluded
                            ? "bg-selected text-ink colorful:bg-rose-500/[0.06]"
                            : "text-ink-2 hover:bg-hover",
                        ].join(" ")}
                      >
                        <Checkbox
                          checked={excluded}
                          onCheckedChange={() => toggleExcludeAccount(name)}
                          disabled={disabled}
                          aria-label={name}
                        />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        <span
                          className={[
                            "shrink-0 text-2xs font-medium",
                            excluded
                              ? "text-ink-2 colorful:text-rose-600 colorful:dark:text-rose-400"
                              : "text-ink-3",
                          ].join(" ")}
                        >
                          {excluded
                            ? t("antigravity_quota.warmup_excluded")
                            : t("antigravity_quota.warmup_included")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </FormSection>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
