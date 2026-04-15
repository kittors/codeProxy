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
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

type ProviderTab = "codex" | "claude" | "gemini" | "kimi";

const PROVIDERS: Array<{ id: ProviderTab; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "kimi", label: "Kimi" },
];

const SESSION_MODE_OPTIONS = [
  { value: "per-request", labelKey: "identity_fingerprint.session_per_request" },
  { value: "server-stable", labelKey: "identity_fingerprint.session_server_stable" },
  { value: "fixed", labelKey: "identity_fingerprint.session_fixed" },
] as const;

const EMPTY_CODEX: Required<CodexIdentityFingerprint> = {
  enabled: false,
  "user-agent": "",
  version: "",
  originator: "",
  "websocket-beta": "",
  "session-mode": "per-request",
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
  const [tab, setTab] = useState<ProviderTab>("codex");
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

  const previewItems = useMemo(
    () => [
      [t("identity_fingerprint.preview_client"), codex["user-agent"]],
      [t("identity_fingerprint.preview_version"), codex.version],
      [
        t("identity_fingerprint.preview_session"),
        codex["session-mode"] === "per-request"
          ? t("identity_fingerprint.session_per_request")
          : codex["session-mode"] === "fixed"
            ? codex["session-id"] || t("identity_fingerprint.preview_server_generated")
            : t("identity_fingerprint.session_server_stable"),
      ],
      [t("identity_fingerprint.preview_transport"), codex["websocket-beta"]],
    ],
    [codex, t],
  );

  return (
    <div className="space-y-4 overflow-x-hidden">
      <Card
        title={t("identity_fingerprint.title")}
        description={t("identity_fingerprint.description")}
        loading={loading}
      >
        <Tabs value={tab} onValueChange={(next) => setTab(next as ProviderTab)}>
          <TabsList>
            {PROVIDERS.map((provider) => (
              <TabsTrigger key={provider.id} value={provider.id}>
                {provider.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="codex" className="mt-5">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/45">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <ToggleSwitch
                    checked={Boolean(codex.enabled)}
                    onCheckedChange={(enabled) => updateCodex({ enabled })}
                    label={t("identity_fingerprint.codex_enabled")}
                    description={t("identity_fingerprint.codex_enabled_desc")}
                    disabled={saving}
                  />
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="secondary" onClick={restoreDefaults} disabled={loading || saving}>
                      {t("identity_fingerprint.restore_defaults")}
                    </Button>
                    <Button onClick={() => void save()} disabled={loading || saving}>
                      {saving ? t("identity_fingerprint.saving") : t("identity_fingerprint.save")}
                    </Button>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <SimplePanel
                    title={t("identity_fingerprint.basic_title")}
                    description={t("identity_fingerprint.basic_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label={t("identity_fingerprint.user_agent")}
                        hint={t("identity_fingerprint.user_agent_hint")}
                      >
                        <TextInput
                          value={codex["user-agent"]}
                          onChange={(event) => updateCodex({ "user-agent": event.target.value })}
                          disabled={saving}
                        />
                      </Field>
                      <Field
                        label={t("identity_fingerprint.version")}
                        hint={t("identity_fingerprint.version_hint")}
                      >
                        <TextInput
                          value={codex.version}
                          onChange={(event) => updateCodex({ version: event.target.value })}
                          disabled={saving}
                        />
                      </Field>
                    </div>
                  </SimplePanel>

                  <SimplePanel
                    title={t("identity_fingerprint.session_title")}
                    description={t("identity_fingerprint.session_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label={t("identity_fingerprint.session_mode")}>
                        <Select
                          value={codex["session-mode"]}
                          onChange={(value) =>
                            updateCodex({
                              "session-mode": value as CodexIdentityFingerprint["session-mode"],
                            })
                          }
                          options={SESSION_MODE_OPTIONS.map((option) => ({
                            value: option.value,
                            label: t(option.labelKey),
                          }))}
                          aria-label={t("identity_fingerprint.session_mode")}
                          className={[
                            "w-full justify-between",
                            saving ? "pointer-events-none opacity-60" : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        />
                      </Field>
                      <Field
                        label={t("identity_fingerprint.session_id")}
                        hint={t("identity_fingerprint.session_id_hint")}
                      >
                        <TextInput
                          value={codex["session-id"]}
                          onChange={(event) => updateCodex({ "session-id": event.target.value })}
                          disabled={saving || codex["session-mode"] !== "fixed"}
                          placeholder={t("identity_fingerprint.session_id_placeholder")}
                        />
                      </Field>
                    </div>
                  </SimplePanel>

                  <SimplePanel
                    title={t("identity_fingerprint.advanced_title")}
                    description={t("identity_fingerprint.advanced_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
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
                    </div>
                    <Field label={t("identity_fingerprint.custom_headers")}>
                      <textarea
                        value={customHeadersText}
                        onChange={(event) => setCustomHeadersText(event.target.value)}
                        disabled={saving}
                        spellCheck={false}
                        className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                        {t("identity_fingerprint.custom_headers_hint")}
                      </p>
                    </Field>
                  </SimplePanel>
                </div>

                <SimplePanel
                  title={t("identity_fingerprint.preview_title")}
                  description={t("identity_fingerprint.preview_desc")}
                >
                  <div className="space-y-2">
                    {previewItems.map(([label, value]) => (
                      <PreviewRow key={label} label={label} value={value} />
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                    {t("identity_fingerprint.notice_desc")}
                  </div>
                </SimplePanel>
              </div>
            </div>
          </TabsContent>

          {PROVIDERS.filter((provider) => provider.id !== "codex").map((provider) => (
            <TabsContent key={provider.id} value={provider.id} className="mt-5">
              <ProviderPlaceholder name={provider.label} />
            </TabsContent>
          ))}
        </Tabs>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function SimplePanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-white/60">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold text-slate-700 dark:text-white/75">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500 dark:text-white/45">{hint}</span> : null}
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-neutral-900/70">
      <div className="text-xs text-slate-500 dark:text-white/45">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-slate-900 dark:text-white">
        {value || "-"}
      </div>
    </div>
  );
}

function ProviderPlaceholder({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{name}</div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-white/60">
        {t("identity_fingerprint.provider_placeholder", { provider: name })}
      </p>
    </div>
  );
}
