import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  identityFingerprintApi,
  type CodexIdentityFingerprint,
  type IdentityFingerprintConfig,
} from "@/lib/http/apis/identity-fingerprint";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

const EMPTY_CODEX: Required<CodexIdentityFingerprint> = {
  enabled: false,
  "user-agent": "",
  version: "",
  originator: "",
  "websocket-beta": "",
  "session-mode": "server-stable",
  "session-id": "",
  "custom-headers": {},
};

function mergeCodex(base: CodexIdentityFingerprint | undefined): Required<CodexIdentityFingerprint> {
  return {
    ...EMPTY_CODEX,
    ...base,
    "custom-headers": base?.["custom-headers"] ?? {},
  };
}

function parseCustomHeaders(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("custom headers must be a JSON object");
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
  );
}

export function IdentityFingerprintPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [codex, setCodex] = useState<Required<CodexIdentityFingerprint>>(EMPTY_CODEX);
  const [defaults, setDefaults] = useState<Required<CodexIdentityFingerprint>>(EMPTY_CODEX);
  const [customHeadersText, setCustomHeadersText] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await identityFingerprintApi.get();
      const nextCodex = mergeCodex(payload["identity-fingerprint"]?.codex);
      const nextDefaults = mergeCodex(payload.defaults?.codex);
      setCodex(nextCodex);
      setDefaults(nextDefaults);
      setCustomHeadersText(JSON.stringify(nextCodex["custom-headers"], null, 2));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("identity_fingerprint.load_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const updateCodex = useCallback((patch: Partial<CodexIdentityFingerprint>) => {
    setCodex((current) => ({ ...current, ...patch }));
  }, []);

  const restoreDefaults = useCallback(() => {
    setCodex(defaults);
    setCustomHeadersText(JSON.stringify(defaults["custom-headers"], null, 2));
  }, [defaults]);

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const customHeaders = parseCustomHeaders(customHeadersText);
      const payload: IdentityFingerprintConfig = {
        codex: {
          ...codex,
          "custom-headers": customHeaders,
        },
      };
      await identityFingerprintApi.update(payload);
      notify({ type: "success", message: t("identity_fingerprint.saved") });
      await loadPage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("identity_fingerprint.save_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }, [codex, customHeadersText, loadPage, notify, t]);

  const previewHeaders = useMemo(() => {
    const rows: Array<[string, string]> = [
      ["User-Agent", codex["user-agent"]],
      ["Version", codex.version],
      ["Session_id", codex["session-id"] || t("identity_fingerprint.preview_server_generated")],
      ["Originator", codex.originator],
      ["OpenAI-Beta", codex["websocket-beta"]],
    ];
    try {
      const custom = parseCustomHeaders(customHeadersText);
      for (const [key, value] of Object.entries(custom)) {
        rows.push([key, value]);
      }
    } catch {
      rows.push([t("identity_fingerprint.custom_headers"), t("identity_fingerprint.invalid_json")]);
    }
    return rows;
  }, [codex, customHeadersText, t]);

  return (
    <div className="space-y-4 overflow-x-hidden">
      <Card
        title={t("identity_fingerprint.title")}
        description={t("identity_fingerprint.description")}
        loading={loading}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={restoreDefaults} disabled={loading || saving}>
              {t("identity_fingerprint.restore_defaults")}
            </Button>
            <Button onClick={() => void save()} disabled={loading || saving}>
              {saving ? t("identity_fingerprint.saving") : t("identity_fingerprint.save")}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/45">
              <ToggleSwitch
                checked={Boolean(codex.enabled)}
                onCheckedChange={(enabled) => updateCodex({ enabled })}
                label={t("identity_fingerprint.codex_enabled")}
                description={t("identity_fingerprint.codex_enabled_desc")}
                disabled={saving}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("identity_fingerprint.user_agent")}>
                <TextInput
                  value={codex["user-agent"]}
                  onChange={(event) => updateCodex({ "user-agent": event.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label={t("identity_fingerprint.version")}>
                <TextInput
                  value={codex.version}
                  onChange={(event) => updateCodex({ version: event.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label={t("identity_fingerprint.originator")}>
                <TextInput
                  value={codex.originator}
                  onChange={(event) => updateCodex({ originator: event.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label={t("identity_fingerprint.websocket_beta")}>
                <TextInput
                  value={codex["websocket-beta"]}
                  onChange={(event) => updateCodex({ "websocket-beta": event.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label={t("identity_fingerprint.session_mode")}>
                <select
                  value={codex["session-mode"]}
                  onChange={(event) =>
                    updateCodex({
                      "session-mode": event.target.value as CodexIdentityFingerprint["session-mode"],
                    })
                  }
                  disabled={saving}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
                >
                  <option value="server-stable">
                    {t("identity_fingerprint.session_server_stable")}
                  </option>
                  <option value="fixed">{t("identity_fingerprint.session_fixed")}</option>
                  <option value="per-request">{t("identity_fingerprint.session_per_request")}</option>
                </select>
              </Field>
              <Field label={t("identity_fingerprint.session_id")}>
                <TextInput
                  value={codex["session-id"]}
                  onChange={(event) => updateCodex({ "session-id": event.target.value })}
                  disabled={saving || codex["session-mode"] === "per-request"}
                  placeholder={t("identity_fingerprint.session_id_placeholder")}
                />
              </Field>
            </div>

            <Field label={t("identity_fingerprint.custom_headers")}>
              <textarea
                value={customHeadersText}
                onChange={(event) => setCustomHeadersText(event.target.value)}
                disabled={saving}
                spellCheck={false}
                className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                {t("identity_fingerprint.custom_headers_hint")}
              </p>
            </Field>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              <div className="font-semibold">{t("identity_fingerprint.notice_title")}</div>
              <p className="mt-1 text-xs leading-5">{t("identity_fingerprint.notice_desc")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("identity_fingerprint.preview_title")}
              </div>
              <div className="mt-3 space-y-2">
                {previewHeaders.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-neutral-900/70"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
                      {key}
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-100">
                      {value || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}
