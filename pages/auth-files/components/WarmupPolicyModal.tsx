import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, TextInput as Input, ToggleSwitch as Switch } from "@code-proxy/ui";
import { goeyToast } from "goey-toast";
import { authFilesApi } from "@code-proxy/api-client";
import { Clock } from "lucide-react";

interface WarmupPolicyModalProps {
  open: boolean;
  onClose: () => void;
  allFileNames: string[];
}

export function WarmupPolicyModal({ open, onClose, allFileNames }: WarmupPolicyModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    authFilesApi
      .getWarmupPolicies()
      .then((res) => {
        const policies = res.policies as any[];
        if (policies && policies.length > 0) {
          const p = policies[0];
          setEnabled(p.enabled ?? true);
          if (p.start_at) setStartAt(new Date(p.start_at).toISOString().slice(0, 16));
          if (p.stop_at) setStopAt(new Date(p.stop_at).toISOString().slice(0, 16));
          if (p.daily_window) {
            setDailyWindowEnabled(p.daily_window.enabled ?? true);
            const sh = String(p.daily_window.start_hour ?? 7).padStart(2, "0");
            const sm = String(p.daily_window.start_minute ?? 0).padStart(2, "0");
            const eh = String(p.daily_window.end_hour ?? 23).padStart(2, "0");
            const em = String(p.daily_window.end_minute ?? 0).padStart(2, "0");
            setDailyStart(`${sh}:${sm}`);
            setDailyEnd(`${eh}:${em}`);
          }
          if (p.interval_seconds) {
            setIntervalHours(String(Math.round(p.interval_seconds / 3600)));
          }
          if (p.stagger_minutes) {
            setStaggerMinutes(String(p.stagger_minutes));
          }
          if (Array.isArray(p.providers)) {
            setTargetAntigravity(p.providers.includes("antigravity"));
            setTargetCodex(p.providers.includes("codex"));
          }
          if (Array.isArray(p.excluded_auth_ids)) {
            setExcludedAuthIds(p.excluded_auth_ids);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
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

      if (startAt) {
        policyPayload.start_at = new Date(startAt).toISOString();
      }
      if (stopAt) {
        policyPayload.stop_at = new Date(stopAt).toISOString();
      }

      await authFilesApi.saveWarmupPolicy(policyPayload);
      goeyToast.success(t("antigravity_quota.warmup_policy_saved"));
      onClose();
    } catch (e: unknown) {
      goeyToast.error(t("antigravity_quota.warmup_policy_save_failed", { message: String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const toggleExcludeAccount = (name: string) => {
    setExcludedAuthIds((prev) =>
      prev.includes(name) ? prev.filter((id) => id !== name) : [...prev, name],
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("antigravity_quota.warmup_policy_title")}
      description={t("antigravity_quota.warmup_policy_desc")}
      maxWidth="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-sm">
        {/* Enable Switch */}
        <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="space-y-0.5">
            <span className="font-medium text-slate-900 dark:text-white">
              {t("antigravity_quota.warmup_policy_enabled")}
            </span>
            <p className="text-xs text-slate-500 dark:text-white/60">
              {t("antigravity_quota.warmup_tooltip")}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Providers */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-white/60">
            {t("antigravity_quota.warmup_target_providers")}
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-slate-800 dark:text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={targetAntigravity}
                onChange={(e) => setTargetAntigravity(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/20"
              />
              <span>Antigravity (Gemini / 3P)</span>
            </label>
            <label className="flex items-center gap-2 text-slate-800 dark:text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={targetCodex}
                onChange={(e) => setTargetCodex(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/20"
              />
              <span>Codex (Spark / 5h)</span>
            </label>
          </div>
        </div>

        {/* Interval & Stagger */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-white/80">
              {t("antigravity_quota.warmup_interval_hours")}
            </label>
            <Input
              type="number"
              min="1"
              max="72"
              value={intervalHours}
              onChange={(e) => setIntervalHours(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-white/80">
              {t("antigravity_quota.warmup_stagger_minutes")}
            </label>
            <Input
              type="number"
              min="1"
              max="120"
              value={staggerMinutes}
              onChange={(e) => setStaggerMinutes(e.target.value)}
            />
          </div>
        </div>

        {/* Daily Active Window */}
        <div className="rounded-lg border border-slate-200/80 p-3 space-y-3 dark:border-white/10 dark:bg-white/[0.01]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-white">
              <Clock size={15} className="text-blue-500" />
              <span>{t("antigravity_quota.warmup_daily_window_title")}</span>
            </div>
            <Switch checked={dailyWindowEnabled} onCheckedChange={setDailyWindowEnabled} />
          </div>
          {dailyWindowEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 dark:text-white/60">
                  {t("antigravity_quota.warmup_daily_start")}
                </span>
                <Input
                  type="time"
                  value={dailyStart}
                  onChange={(e) => setDailyStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500 dark:text-white/60">
                  {t("antigravity_quota.warmup_daily_end")}
                </span>
                <Input
                  type="time"
                  value={dailyEnd}
                  onChange={(e) => setDailyEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Start / Stop Date Times */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-white/80">
              {t("antigravity_quota.warmup_policy_start_at")}
            </label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-white/80">
              {t("antigravity_quota.warmup_policy_stop_at")}
            </label>
            <Input
              type="datetime-local"
              value={stopAt}
              onChange={(e) => setStopAt(e.target.value)}
            />
          </div>
        </div>

        {/* Account Exclusions Selection */}
        {allFileNames.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-white/60">
                单独排除账号 (不参与自动预热)
              </label>
              <span className="text-xs text-slate-400">
                已排除 {excludedAuthIds.length} / {allFileNames.length}
              </span>
            </div>
            <div className="max-h-28 overflow-y-auto rounded border border-slate-200 p-1.5 space-y-1 text-xs dark:border-white/10">
              {allFileNames.map((name) => {
                const excluded = excludedAuthIds.includes(name);
                return (
                  <div
                    key={name}
                    onClick={() => toggleExcludeAccount(name)}
                    className={`flex items-center justify-between rounded px-2 py-1 cursor-pointer transition-colors ${
                      excluded
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
                        : "hover:bg-slate-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-2xs font-medium">
                      {excluded ? "已排除" : "自动预热"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
