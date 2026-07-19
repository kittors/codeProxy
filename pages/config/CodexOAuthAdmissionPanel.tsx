import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  configApi,
  type CodexOAuthAllowedClientPresetInfo,
  type CodexOAuthAdmissionResponse,
} from "@code-proxy/api-client";
import { Card, Checkbox, ConfirmModal, useToast } from "@code-proxy/ui";

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
      <Card
        title={t("config_page.codex_oauth_admission_title")}
        description={t("config_page.codex_oauth_admission_source_desc")}
        loading={loading}
      >
        <div data-testid="codex-oauth-global-admission-panel" className="space-y-3">
          <div className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-2xs font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20">
            {t("config_page.tenant_override_badge")}
          </div>
          {availableClients.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {availableClients.map((preset) => (
                <label
                  key={preset.id}
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10"
                >
                  <Checkbox
                    checked={allowedClients.includes(preset.id)}
                    disabled={loading || saving}
                    onCheckedChange={(checked) => setPending({ preset, checked })}
                    aria-label={preset.label}
                    data-testid={`codex-oauth-global-preset-${preset.id}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      {preset.label}
                    </span>
                    {preset.description ? (
                      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-white/55">
                        {preset.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-white/55">
              {t("config_page.codex_oauth_admission_empty")}
            </p>
          )}
          <p className="text-xs leading-5 text-slate-500 dark:text-white/55">
            {t("config_page.codex_oauth_admission_trace_hint")}
          </p>
        </div>
      </Card>

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
        confirmText={t("config_page.oauth_admission_confirm")}
        cancelText={t("ui.cancel_default")}
        variant={pending?.checked ? "primary" : "danger"}
        busy={saving}
        onClose={() => {
          if (!saving) setPending(null);
        }}
        onConfirm={() => void applyPending()}
      />
    </>
  );
}
