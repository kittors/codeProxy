import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Wand2, X } from "lucide-react";
import {
  ipAccessApi,
  type AutoBanMode,
  type IpAccessStatus,
  type ProtectionPolicy,
  type ThrottleScopeView,
} from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  PageLoader,
  Select,
  TextInput,
  ToggleSwitch,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";

interface ProtectionPolicyTabProps {
  status: IpAccessStatus | null;
  onPolicySaved: () => void;
}

export function ProtectionPolicyTab({ status, onPolicySaved }: ProtectionPolicyTabProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [policy, setPolicy] = useState<ProtectionPolicy | null>(null);
  const [throttle, setThrottle] = useState<ThrottleScopeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proxyDraft, setProxyDraft] = useState("");
  const [lockdownConfirm, setLockdownConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await ipAccessApi.policy();
      setPolicy(response.policy);
      setThrottle(response.throttle ?? []);
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("ip_access.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    try {
      const response = await ipAccessApi.updatePolicy(policy);
      setPolicy(response.policy);
      setThrottle(response.throttle ?? []);
      onPolicySaved();
      notify({ type: "success", message: t("ip_access.policy_saved") });
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("ip_access.save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !policy) {
    return (
      <div className="border-t border-slate-100 px-5 py-10 dark:border-white/8">
        <PageLoader />
      </div>
    );
  }

  const lockdownBlocked = !status?.trusted || status?.self_allowed === false;

  const proxies = policy.trusted_proxies ?? [];

  const addProxy = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || proxies.includes(trimmed)) return;
    setPolicy({ ...policy, trusted_proxies: [...proxies, trimmed] });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-slate-100 px-5 py-4 dark:border-white/8">
      {/* First, because nothing below it takes effect until this is right. */}
      <Section
        title={t("ip_access.section_trusted_proxies")}
        description={t("ip_access.section_trusted_proxies_desc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          {proxies.length === 0 ? (
            <span className="text-xs text-slate-500 dark:text-white/50">
              {status?.trusted_proxies_source === "config"
                ? t("ip_access.proxies_from_config", {
                    list: (status.trusted_proxies ?? []).join(", "),
                  })
                : t("ip_access.proxies_empty")}
            </span>
          ) : (
            proxies.map((proxy) => (
              <span
                key={proxy}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2 font-mono text-xs text-slate-700 dark:bg-white/10 dark:text-white/80"
              >
                {proxy}
                <PermissionGate permission="platform.ip_access.write">
                  <button
                    type="button"
                    onClick={() =>
                      setPolicy({
                        ...policy,
                        trusted_proxies: proxies.filter((item) => item !== proxy),
                      })
                    }
                    aria-label={t("ip_access.proxy_remove", { cidr: proxy })}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-black/10 dark:hover:bg-white/15"
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </PermissionGate>
              </span>
            ))
          )}
        </div>
        {status?.forwarded_chain && status.forwarded_chain.length > 0 ? (
          // Without this an operator is guessing which hops to declare, and a
          // chain declared one hop short resolves to loopback and silently
          // exempts everyone.
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
            <p className="text-xs font-medium text-slate-700 dark:text-white/80">
              {t("ip_access.chain_title")}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-600 dark:text-white/70">
              {[...status.forwarded_chain, status.peer].filter(Boolean).join("  ←  ")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("ip_access.chain_hint", { client: status.client_ip || "-" })}
            </p>
          </div>
        ) : null}
        <PermissionGate permission="platform.ip_access.write">
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-full min-[480px]:w-[220px]">
              <TextInput
                value={proxyDraft}
                onChange={(event) => setProxyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addProxy(proxyDraft);
                    setProxyDraft("");
                  }
                }}
                placeholder="203.0.113.10 / 10.0.0.0/24"
                size="sm"
                className="font-mono"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!proxyDraft.trim()}
              onClick={() => {
                addProxy(proxyDraft);
                setProxyDraft("");
              }}
            >
              {t("ip_access.proxy_add")}
            </Button>
            {status && !status.trusted && status.suggested_trusted_proxies?.[0] ? (
              // The one action that turns this feature on, offered where the
              // problem is visible instead of as a config snippet to go paste.
              <Button
                size="sm"
                variant="primary"
                onClick={() => addProxy(status.suggested_trusted_proxies?.[0] ?? "")}
              >
                <Wand2 size={14} />
                {t("ip_access.proxy_add_detected", {
                  cidr: status.suggested_trusted_proxies[0],
                })}
              </Button>
            ) : null}
          </div>
        </PermissionGate>
      </Section>

      <Section
        title={t("ip_access.section_lockdown")}
        description={t("ip_access.section_lockdown_desc")}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-white/80">
              {t("ip_access.lockdown_label")}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {lockdownBlocked && !policy.lockdown
                ? t("ip_access.lockdown_blocked_hint", {
                    cidr: status?.suggested_self_rule ?? "",
                  })
                : t("ip_access.lockdown_hint")}
            </p>
          </div>
          <PermissionGate permission="platform.ip_access.write">
            <ToggleSwitch
              checked={policy.lockdown}
              disabled={saving || (lockdownBlocked && !policy.lockdown)}
              onCheckedChange={(next) => {
                // Turning it off is always safe; turning it on can lock the
                // operator out, so that direction asks first.
                if (next) {
                  setLockdownConfirm(true);
                  return;
                }
                setPolicy({ ...policy, lockdown: false });
              }}
              ariaLabel={t("ip_access.lockdown_label")}
            />
          </PermissionGate>
        </div>
      </Section>

      <Section
        title={t("ip_access.section_auto_ban")}
        description={t("ip_access.section_auto_ban_desc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("ip_access.auto_ban_mode")} hint={t(`ip_access.auto_ban_mode_hint_${policy.auto_ban.mode}`)}>
            <Select
              value={policy.auto_ban.mode}
              onChange={(value) =>
                setPolicy({
                  ...policy,
                  auto_ban: { ...policy.auto_ban, mode: value as AutoBanMode },
                })
              }
              options={(["off", "observe", "enforce"] as AutoBanMode[]).map((mode) => ({
                value: mode,
                label: t(`ip_access.auto_ban_mode_${mode}`),
              }))}
              fullWidth
            />
          </Field>
          <NumberField
            label={t("ip_access.auto_ban_threshold")}
            hint={t("ip_access.auto_ban_threshold_hint")}
            value={policy.auto_ban.failure_threshold}
            onChange={(value) =>
              setPolicy({ ...policy, auto_ban: { ...policy.auto_ban, failure_threshold: value } })
            }
          />
          <NumberField
            label={t("ip_access.auto_ban_window")}
            hint={t("ip_access.auto_ban_window_hint")}
            value={policy.auto_ban.window_seconds}
            onChange={(value) =>
              setPolicy({ ...policy, auto_ban: { ...policy.auto_ban, window_seconds: value } })
            }
          />
          <NumberField
            label={t("ip_access.auto_ban_minutes")}
            hint={t("ip_access.auto_ban_minutes_hint")}
            value={policy.auto_ban.ban_minutes}
            onChange={(value) =>
              setPolicy({ ...policy, auto_ban: { ...policy.auto_ban, ban_minutes: value } })
            }
          />
        </div>
      </Section>

      <Section
        title={t("ip_access.section_throttle")}
        description={t("ip_access.section_throttle_desc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("ip_access.throttle_account_limit")}
            hint={t("ip_access.throttle_account_limit_hint")}
            value={policy.throttle.account_failure_limit}
            onChange={(value) =>
              setPolicy({
                ...policy,
                throttle: { ...policy.throttle, account_failure_limit: value },
              })
            }
          />
          <NumberField
            label={t("ip_access.throttle_window")}
            hint={t("ip_access.throttle_window_hint")}
            value={policy.throttle.login_failure_window_seconds}
            onChange={(value) =>
              setPolicy({
                ...policy,
                throttle: { ...policy.throttle, login_failure_window_seconds: value },
              })
            }
          />
          <NumberField
            label={t("ip_access.throttle_mgmt_limit")}
            hint={t("ip_access.throttle_mgmt_limit_hint")}
            value={policy.throttle.management_key_failure_limit}
            onChange={(value) =>
              setPolicy({
                ...policy,
                throttle: { ...policy.throttle, management_key_failure_limit: value },
              })
            }
          />
          <NumberField
            label={t("ip_access.throttle_reset_hours")}
            hint={t("ip_access.throttle_reset_hours_hint")}
            value={policy.throttle.failure_reset_hours}
            onChange={(value) =>
              setPolicy({ ...policy, throttle: { ...policy.throttle, failure_reset_hours: value } })
            }
          />
        </div>
      </Section>

      <Section
        title={t("ip_access.section_alert")}
        description={t("ip_access.section_alert_desc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("ip_access.alert_webhook")} hint={t("ip_access.alert_webhook_hint")}>
            <TextInput
              value={policy.alert?.webhook_url ?? ""}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  alert: { ...policy.alert, webhook_url: event.target.value },
                })
              }
              placeholder="https://hooks.example.com/…"
            />
          </Field>
          <NumberField
            label={t("ip_access.alert_cooldown")}
            hint={t("ip_access.alert_cooldown_hint")}
            value={policy.alert?.cooldown_minutes ?? 30}
            onChange={(value) =>
              setPolicy({ ...policy, alert: { ...policy.alert, cooldown_minutes: value } })
            }
          />
          <div className="flex items-start justify-between gap-4 sm:col-span-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-white/80">
                {t("ip_access.alert_notify_observe")}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("ip_access.alert_notify_observe_hint")}
              </p>
            </div>
            <PermissionGate permission="platform.ip_access.write">
              <ToggleSwitch
                checked={policy.alert?.notify_observe ?? false}
                disabled={saving}
                onCheckedChange={(next) =>
                  setPolicy({ ...policy, alert: { ...policy.alert, notify_observe: next } })
                }
                ariaLabel={t("ip_access.alert_notify_observe")}
              />
            </PermissionGate>
          </div>
          <NumberField
            label={t("ip_access.retention_days")}
            hint={t("ip_access.retention_days_hint")}
            value={policy.attempt_retention_days ?? 30}
            onChange={(value) => setPolicy({ ...policy, attempt_retention_days: value })}
          />
        </div>
      </Section>

      <Section
        title={t("ip_access.section_effective")}
        description={t("ip_access.section_effective_desc")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t("ip_access.effective_scope")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("ip_access.effective_key")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("ip_access.effective_short")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("ip_access.effective_long")}</th>
                <th className="py-1.5 font-medium">{t("ip_access.effective_reset")}</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-white/80">
              {throttle.map((row) => (
                <tr key={row.scope} className="border-t border-slate-100 dark:border-white/8">
                  <td className="py-1.5 pr-3">{t(`ip_access.scope_${row.scope}`)}</td>
                  <td className="py-1.5 pr-3 text-slate-500">
                    {t(`ip_access.dimension_${row.key_dimension}`)}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.short_limit > 0 ? `${row.short_limit} / ${row.short_window}` : "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.long_limit > 0 ? `${row.long_limit} / ${row.long_window}` : "—"}
                  </td>
                  <td className="py-1.5 tabular-nums">{row.reset_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <ConfirmModal
        open={lockdownConfirm}
        title={t("ip_access.lockdown_confirm_title")}
        description={t("ip_access.lockdown_confirm_body", {
          cidr: status?.suggested_self_rule ?? "",
        })}
        confirmText={t("ip_access.lockdown_confirm_ok")}
        cancelText={t("common.cancel")}
        variant="danger"
        onClose={() => setLockdownConfirm(false)}
        onConfirm={() => {
          setPolicy({ ...policy, lockdown: true });
          setLockdownConfirm(false);
        }}
      />

      <PermissionGate permission="platform.ip_access.write">
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            <Save size={15} />
            {t("common.save")}
          </Button>
        </div>
      </PermissionGate>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] px-4 py-4 dark:border-white/[0.06]">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">{description}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700 dark:text-white/80">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        type="number"
        min={0}
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </Field>
  );
}
