import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  configApi,
  type CodexOAuthAllowedClientPresetInfo,
  type CodexOAuthAdmissionResponse,
} from "@code-proxy/api-client";
import { Checkbox, ConfirmModal, Skeleton, surface, useToast } from "@code-proxy/ui";

const emptyAdmission: CodexOAuthAdmissionResponse = {
  allowed_clients: [],
  available_allowed_clients: [],
};

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === "string").map((item) => item.trim()),
    ),
  ).filter(Boolean);
}

export function CodexOAuthAdmissionPanel() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowedClients, setAllowedClients] = useState<string[]>([]);
  const [availableClients, setAvailableClients] = useState<CodexOAuthAllowedClientPresetInfo[]>([]);
  const [pending, setPending] = useState<{
    preset: CodexOAuthAllowedClientPresetInfo;
    checked: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await configApi.getCodexOAuthAdmission().catch(() => emptyAdmission);
      setAllowedClients(
        normalizeStringList(
          response.allowed_clients ?? response["codex-oauth-admission"]?.allowed_clients,
        ),
      );
      setAvailableClients(response.available_allowed_clients ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPending = useCallback(async () => {
    if (!pending) return;
    const previous = allowedClients;
    const next = pending.checked
      ? Array.from(new Set([...allowedClients, pending.preset.id]))
      : allowedClients.filter((value) => value !== pending.preset.id);

    setPending(null);
    setAllowedClients(next);
    setSaving(true);
    try {
      await configApi.updateCodexOAuthAdmission(next);
      notify({ type: "success", message: t("config_page.toast_updated") });
    } catch (error: unknown) {
      setAllowedClients(previous);
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("config_page.toast_update_failed"),
      });
    } finally {
      setSaving(false);
    }
  }, [allowedClients, notify, pending, t]);

  return (
    <>
      {/* 标题与说明由配置页的「Codex 客户端准入」分区给出，这里只放内容。 */}
      <div
        data-testid="codex-oauth-global-admission-panel"
        aria-busy={loading}
        // 分区标题下面的唯一一层卡片（和设置组同一种外观）；客户端选项是卡片里的无边淡底块。
        className={`space-y-3 p-5 ${surface({ radius: "2xl" })}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-sky-500/10 px-2.5 py-1 text-2xs font-medium text-sky-700 dark:text-sky-300">
            {t("config_page.tenant_override_badge")}
          </span>
          <span className="text-xs text-ink-3">{t("config_page.codex_oauth_admission_source_desc")}</span>
        </div>
        {loading ? (
          <div className="grid gap-2 md:grid-cols-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : availableClients.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {availableClients.map((preset) => {
              const checked = allowedClients.includes(preset.id);
              return (
                <label
                  key={preset.id}
                  className={[
                    "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl px-3.5 py-3 transition-colors",
                    checked ? "bg-accent-soft" : "bg-subtle hover:bg-hover",
                  ].join(" ")}
                >
                  <Checkbox
                    checked={checked}
                    disabled={loading || saving}
                    onCheckedChange={(next) => setPending({ preset, checked: next })}
                    aria-label={preset.label}
                    data-testid={`codex-oauth-global-preset-${preset.id}`}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{preset.label}</span>
                    {preset.description ? (
                      <span className="mt-0.5 block text-xs leading-5 text-ink-3">
                        {preset.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-ink-3">
            {t("config_page.codex_oauth_admission_empty")}
          </p>
        )}
        <p className="text-xs leading-5 text-ink-3">
          {t("config_page.codex_oauth_admission_trace_hint")}
        </p>
      </div>

      <ConfirmModal
        open={pending !== null}
        title={
          pending?.checked
            ? t("config_page.oauth_admission_enable_title")
            : t("config_page.oauth_admission_disable_title")
        }
        description={t("config_page.oauth_admission_confirm_desc", {
          client: pending?.preset.label ?? "",
        })}
        subject={
          pending ? (
            <span className="block">
              <span className="block font-medium">{pending.preset.label}</span>
              {pending.preset.description ? (
                <span className="mt-0.5 block text-xs text-ink-3">{pending.preset.description}</span>
              ) : null}
            </span>
          ) : null
        }
        confirmText={t("config_page.oauth_admission_confirm")}
        cancelText={t("ui.cancel_default")}
        variant={pending?.checked ? "primary" : "warning"}
        busy={saving}
        onClose={() => {
          if (!saving) setPending(null);
        }}
        onConfirm={() => void applyPending()}
      />
    </>
  );
}
