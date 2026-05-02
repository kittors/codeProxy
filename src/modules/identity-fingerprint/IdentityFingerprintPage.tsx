import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { configFileApi } from "@/lib/http/apis/config-file";
import {
  identityFingerprintApi,
  type ClaudeIdentityFingerprint,
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

const EMPTY_CLAUDE: Required<ClaudeIdentityFingerprint> = {
  enabled: false,
  "cli-version": "2.1.88",
  entrypoint: "cli",
  "user-agent": "claude-cli/2.1.88 (external, cli)",
  "anthropic-beta":
    "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,redact-thinking-2026-02-12,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24",
  "stainless-package-version": "0.74.0",
  "stainless-runtime-version": "v22.13.0",
  "stainless-timeout": "600",
  "session-mode": "per-request",
  "session-id": "",
  "device-id": "",
  "custom-headers": {},
};

type KimiHeaderDefaults = {
  "user-agent": string;
  platform: string;
  version: string;
};

const DEFAULT_KIMI_HEADERS: KimiHeaderDefaults = {
  "user-agent": "KimiCLI/1.10.6",
  platform: "kimi_cli",
  version: "1.10.6",
};

const DEFAULT_GEMINI_HEADERS: Record<string, string> = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
};

function mergeCodex(
  base: CodexIdentityFingerprint | undefined,
): Required<CodexIdentityFingerprint> {
  return {
    ...EMPTY_CODEX,
    ...base,
    "custom-headers": base?.["custom-headers"] ?? {},
  };
}

function mergeClaude(
  base: ClaudeIdentityFingerprint | undefined,
): Required<ClaudeIdentityFingerprint> {
  return {
    ...EMPTY_CLAUDE,
    ...base,
    "custom-headers": base?.["custom-headers"] ?? {},
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readString(obj: Record<string, unknown> | null, key: string, fallback = ""): string {
  const value = obj?.[key];
  return typeof value === "string" ? value : fallback;
}

function toHeaderMap(raw: unknown): Record<string, string> {
  const record = asRecord(raw);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key.trim(), String(value ?? "").trim()])
      .filter(([key, value]) => key !== "" && value !== ""),
  );
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

function parseHeadersJson(raw: string): Record<string, string> {
  return parseCustomHeaders(raw);
}

function parseConfigYaml(raw: string): Record<string, unknown> {
  const parsed = parseYaml(raw) as unknown;
  return asRecord(parsed) ?? {};
}

function normalizeKimiHeaders(raw: unknown): KimiHeaderDefaults {
  const record = asRecord(raw);
  return {
    "user-agent": readString(record, "user-agent", DEFAULT_KIMI_HEADERS["user-agent"]),
    platform: readString(record, "platform", DEFAULT_KIMI_HEADERS.platform),
    version: readString(record, "version", DEFAULT_KIMI_HEADERS.version),
  };
}

function firstGeminiHeaders(raw: unknown): { headers: Record<string, string>; count: number } {
  const entries = Array.isArray(raw) ? raw : [];
  for (const entry of entries) {
    const record = asRecord(entry);
    const headers = toHeaderMap(record?.headers);
    if (Object.keys(headers).length > 0) {
      return { headers, count: entries.length };
    }
  }
  return { headers: DEFAULT_GEMINI_HEADERS, count: entries.length };
}

function setHeadersObject(obj: Record<string, unknown>, value: Record<string, string>): void {
  const next = Object.fromEntries(
    Object.entries(value)
      .map(([key, val]) => [key.trim(), String(val ?? "").trim()])
      .filter(([key, val]) => key !== "" && val !== ""),
  );
  if (Object.keys(next).length > 0) {
    obj.headers = next;
    return;
  }
  if (hasOwn(obj, "headers")) delete obj.headers;
}

function upsertGeminiHeaders(
  root: Record<string, unknown>,
  headers: Record<string, string>,
): { root: Record<string, unknown>; count: number } {
  const rawEntries = Array.isArray(root["gemini-api-key"]) ? root["gemini-api-key"] : [];
  if (rawEntries.length === 0) {
    throw new Error("No Gemini API key entries found in config.yaml");
  }

  root["gemini-api-key"] = rawEntries.map((entry) => {
    const record = asRecord(entry);
    const next = record ? { ...record } : { "api-key": String(entry ?? "") };
    setHeadersObject(next, headers);
    return next;
  });

  return { root, count: rawEntries.length };
}

export function IdentityFingerprintPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [tab, setTab] = useState<ProviderTab>("codex");
  const [codex, setCodex] = useState<Required<CodexIdentityFingerprint>>(EMPTY_CODEX);
  const [defaults, setDefaults] = useState<Required<CodexIdentityFingerprint>>(EMPTY_CODEX);
  const [claude, setClaude] = useState<Required<ClaudeIdentityFingerprint>>(EMPTY_CLAUDE);
  const [claudeDefaults, setClaudeDefaults] =
    useState<Required<ClaudeIdentityFingerprint>>(EMPTY_CLAUDE);
  const [configYaml, setConfigYaml] = useState("");
  const [kimi, setKimi] = useState<KimiHeaderDefaults>(DEFAULT_KIMI_HEADERS);
  const [geminiHeadersText, setGeminiHeadersText] = useState(
    JSON.stringify(DEFAULT_GEMINI_HEADERS, null, 2),
  );
  const [geminiKeyCount, setGeminiKeyCount] = useState(0);
  const [customHeadersText, setCustomHeadersText] = useState("{}");
  const [claudeCustomHeadersText, setClaudeCustomHeadersText] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [payload, yamlText] = await Promise.all([
        identityFingerprintApi.get(),
        configFileApi.fetchConfigYaml(),
      ]);
      const nextCodex = mergeCodex(payload["identity-fingerprint"]?.codex);
      const nextDefaults = mergeCodex(payload.defaults?.codex);
      const nextClaude = mergeClaude(payload["identity-fingerprint"]?.claude);
      const nextClaudeDefaults = mergeClaude(payload.defaults?.claude);
      const parsedConfig = parseConfigYaml(yamlText);
      const gemini = firstGeminiHeaders(parsedConfig["gemini-api-key"]);
      setCodex(nextCodex);
      setDefaults(nextDefaults);
      setClaude(nextClaude);
      setClaudeDefaults(nextClaudeDefaults);
      setConfigYaml(yamlText);
      setKimi(normalizeKimiHeaders(parsedConfig["kimi-header-defaults"]));
      setGeminiHeadersText(JSON.stringify(gemini.headers, null, 2));
      setGeminiKeyCount(gemini.count);
      setCustomHeadersText(JSON.stringify(nextCodex["custom-headers"], null, 2));
      setClaudeCustomHeadersText(JSON.stringify(nextClaude["custom-headers"], null, 2));
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

  const updateClaude = useCallback((patch: Partial<ClaudeIdentityFingerprint>) => {
    setClaude((current) => ({ ...current, ...patch }));
  }, []);

  const restoreDefaults = useCallback(() => {
    setCodex(defaults);
    setCustomHeadersText(JSON.stringify(defaults["custom-headers"], null, 2));
  }, [defaults]);

  const restoreClaudeDefaults = useCallback(() => {
    setClaude(claudeDefaults);
    setClaudeCustomHeadersText(JSON.stringify(claudeDefaults["custom-headers"], null, 2));
  }, [claudeDefaults]);

  const restoreGeminiDefaults = useCallback(() => {
    setGeminiHeadersText(JSON.stringify(DEFAULT_GEMINI_HEADERS, null, 2));
  }, []);

  const restoreKimiDefaults = useCallback(() => {
    setKimi(DEFAULT_KIMI_HEADERS);
  }, []);

  const saveConfigYaml = useCallback(
    async (mutate: (root: Record<string, unknown>) => Record<string, unknown>) => {
      const root = parseConfigYaml(configYaml);
      const nextRoot = mutate(root);
      const nextYaml = stringifyYaml(nextRoot);
      await configFileApi.saveConfigYaml(nextYaml);
      setConfigYaml(nextYaml);
    },
    [configYaml],
  );

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
        claude,
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
  }, [claude, codex, customHeadersText, loadPage, notify, t]);

  const saveClaude = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const customHeaders = parseCustomHeaders(claudeCustomHeadersText);
      const payload: IdentityFingerprintConfig = {
        codex,
        claude: {
          ...claude,
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
  }, [claude, claudeCustomHeadersText, codex, loadPage, notify, t]);

  const saveGemini = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const headers = parseHeadersJson(geminiHeadersText);
      await saveConfigYaml((root) => upsertGeminiHeaders(root, headers).root);
      notify({ type: "success", message: t("identity_fingerprint.saved") });
      await loadPage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("identity_fingerprint.save_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }, [geminiHeadersText, loadPage, notify, saveConfigYaml, t]);

  const saveKimi = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await saveConfigYaml((root) => {
        root["kimi-header-defaults"] = { ...kimi };
        return root;
      });
      notify({ type: "success", message: t("identity_fingerprint.saved") });
      await loadPage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("identity_fingerprint.save_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }, [kimi, loadPage, notify, saveConfigYaml, t]);

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

  const claudePreviewItems = useMemo(
    () => [
      [t("identity_fingerprint.preview_client"), claude["user-agent"]],
      [t("identity_fingerprint.preview_version"), claude["cli-version"]],
      [t("identity_fingerprint.claude_entrypoint"), claude.entrypoint],
      [
        t("identity_fingerprint.preview_session"),
        claude["session-mode"] === "per-request"
          ? t("identity_fingerprint.session_per_request")
          : claude["session-mode"] === "fixed"
            ? claude["session-id"] || t("identity_fingerprint.preview_server_generated")
            : t("identity_fingerprint.session_server_stable"),
      ],
      [
        t("identity_fingerprint.claude_stainless_package_version"),
        claude["stainless-package-version"],
      ],
    ],
    [claude, t],
  );

  const kimiPreviewItems = useMemo(
    () => [
      [t("identity_fingerprint.preview_client"), kimi["user-agent"]],
      [t("identity_fingerprint.kimi_platform"), kimi.platform],
      [t("identity_fingerprint.preview_version"), kimi.version],
    ],
    [kimi, t],
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
                    <Button
                      variant="secondary"
                      onClick={restoreDefaults}
                      disabled={loading || saving}
                    >
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
                          onChange={(event) =>
                            updateCodex({ "websocket-beta": event.target.value })
                          }
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

          <TabsContent value="claude" className="mt-5">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/45">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <ToggleSwitch
                    checked={Boolean(claude.enabled)}
                    onCheckedChange={(enabled) => updateClaude({ enabled })}
                    label={t("identity_fingerprint.claude_enabled")}
                    description={t("identity_fingerprint.claude_enabled_desc")}
                    disabled={saving}
                  />
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={restoreClaudeDefaults}
                      disabled={loading || saving}
                    >
                      {t("identity_fingerprint.restore_defaults")}
                    </Button>
                    <Button onClick={() => void saveClaude()} disabled={loading || saving}>
                      {saving
                        ? t("identity_fingerprint.saving")
                        : t("identity_fingerprint.save_claude")}
                    </Button>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <SimplePanel
                    title={t("identity_fingerprint.claude_title")}
                    description={t("identity_fingerprint.claude_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label={t("identity_fingerprint.claude_cli_version")}
                        hint={t("identity_fingerprint.claude_cli_version_hint")}
                      >
                        <TextInput
                          value={claude["cli-version"]}
                          onChange={(event) => updateClaude({ "cli-version": event.target.value })}
                          disabled={saving}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.claude_entrypoint")}>
                        <TextInput
                          value={claude.entrypoint}
                          onChange={(event) => updateClaude({ entrypoint: event.target.value })}
                          disabled={saving}
                        />
                      </Field>
                      <Field
                        label={t("identity_fingerprint.user_agent")}
                        hint={t("identity_fingerprint.claude_user_agent_hint")}
                      >
                        <TextInput
                          value={claude["user-agent"]}
                          onChange={(event) => updateClaude({ "user-agent": event.target.value })}
                          disabled={saving}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.claude_anthropic_beta")}>
                        <TextInput
                          value={claude["anthropic-beta"]}
                          onChange={(event) =>
                            updateClaude({ "anthropic-beta": event.target.value })
                          }
                          disabled={saving}
                        />
                      </Field>
                    </div>
                  </SimplePanel>

                  <SimplePanel
                    title={t("identity_fingerprint.claude_stainless_title")}
                    description={t("identity_fingerprint.claude_stainless_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label={t("identity_fingerprint.claude_stainless_package_version")}>
                        <TextInput
                          value={claude["stainless-package-version"]}
                          onChange={(event) =>
                            updateClaude({ "stainless-package-version": event.target.value })
                          }
                          disabled={saving}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.claude_stainless_runtime_version")}>
                        <TextInput
                          value={claude["stainless-runtime-version"]}
                          onChange={(event) =>
                            updateClaude({ "stainless-runtime-version": event.target.value })
                          }
                          disabled={saving}
                        />
                      </Field>
                      <Field
                        label={t("identity_fingerprint.claude_stainless_timeout")}
                        hint={t("identity_fingerprint.claude_timeout_hint")}
                      >
                        <TextInput
                          value={claude["stainless-timeout"]}
                          onChange={(event) =>
                            updateClaude({ "stainless-timeout": event.target.value })
                          }
                          disabled={saving}
                        />
                      </Field>
                    </div>
                  </SimplePanel>

                  <SimplePanel
                    title={t("identity_fingerprint.session_title")}
                    description={t("identity_fingerprint.claude_session_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label={t("identity_fingerprint.session_mode")}>
                        <Select
                          value={claude["session-mode"]}
                          onChange={(value) =>
                            updateClaude({
                              "session-mode": value as ClaudeIdentityFingerprint["session-mode"],
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
                          value={claude["session-id"]}
                          onChange={(event) => updateClaude({ "session-id": event.target.value })}
                          disabled={saving || claude["session-mode"] !== "fixed"}
                          placeholder={t("identity_fingerprint.session_id_placeholder")}
                        />
                      </Field>
                    </div>
                    <Field
                      label={t("identity_fingerprint.claude_device_id")}
                      hint={t("identity_fingerprint.claude_device_id_hint")}
                    >
                      <TextInput
                        value={claude["device-id"]}
                        onChange={(event) => updateClaude({ "device-id": event.target.value })}
                        disabled={saving}
                      />
                    </Field>
                    <Field label={t("identity_fingerprint.custom_headers")}>
                      <textarea
                        value={claudeCustomHeadersText}
                        onChange={(event) => setClaudeCustomHeadersText(event.target.value)}
                        disabled={saving}
                        spellCheck={false}
                        className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                        {t("identity_fingerprint.claude_custom_headers_hint")}
                      </p>
                    </Field>
                  </SimplePanel>
                </div>

                <SimplePanel
                  title={t("identity_fingerprint.preview_title")}
                  description={t("identity_fingerprint.claude_preview_desc")}
                >
                  <div className="space-y-2">
                    {claudePreviewItems.map(([label, value]) => (
                      <PreviewRow key={label} label={label} value={value} />
                    ))}
                  </div>
                  <ProviderNotice>{t("identity_fingerprint.claude_notice")}</ProviderNotice>
                </SimplePanel>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="gemini" className="mt-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <SimplePanel
                title={t("identity_fingerprint.gemini_title")}
                description={t("identity_fingerprint.gemini_desc")}
              >
                <Field label={t("identity_fingerprint.headers_json")}>
                  <textarea
                    value={geminiHeadersText}
                    onChange={(event) => setGeminiHeadersText(event.target.value)}
                    disabled={saving}
                    spellCheck={false}
                    className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                    {t("identity_fingerprint.gemini_headers_hint")}
                  </p>
                </Field>
                <ProviderActions
                  restoreLabel={t("identity_fingerprint.restore_defaults")}
                  saveLabel={
                    saving
                      ? t("identity_fingerprint.saving")
                      : t("identity_fingerprint.save_gemini")
                  }
                  onRestore={restoreGeminiDefaults}
                  onSave={() => void saveGemini()}
                  disabled={loading || saving || geminiKeyCount === 0}
                />
              </SimplePanel>

              <SimplePanel
                title={t("identity_fingerprint.preview_title")}
                description={t("identity_fingerprint.gemini_preview_desc")}
              >
                <PreviewRow
                  label={t("identity_fingerprint.gemini_key_count")}
                  value={t("identity_fingerprint.gemini_key_count_value", {
                    count: geminiKeyCount,
                  })}
                />
                <ProviderNotice>
                  {geminiKeyCount > 0
                    ? t("identity_fingerprint.gemini_notice")
                    : t("identity_fingerprint.gemini_empty_notice")}
                </ProviderNotice>
              </SimplePanel>
            </div>
          </TabsContent>

          <TabsContent value="kimi" className="mt-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <SimplePanel
                title={t("identity_fingerprint.kimi_title")}
                description={t("identity_fingerprint.kimi_desc")}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label={t("identity_fingerprint.user_agent")}
                    hint={t("identity_fingerprint.kimi_user_agent_hint")}
                  >
                    <TextInput
                      value={kimi["user-agent"]}
                      onChange={(event) =>
                        setKimi((current) => ({ ...current, "user-agent": event.target.value }))
                      }
                      disabled={saving}
                    />
                  </Field>
                  <Field label={t("identity_fingerprint.kimi_platform")}>
                    <TextInput
                      value={kimi.platform}
                      onChange={(event) =>
                        setKimi((current) => ({ ...current, platform: event.target.value }))
                      }
                      disabled={saving}
                    />
                  </Field>
                  <Field label={t("identity_fingerprint.version")}>
                    <TextInput
                      value={kimi.version}
                      onChange={(event) =>
                        setKimi((current) => ({ ...current, version: event.target.value }))
                      }
                      disabled={saving}
                    />
                  </Field>
                </div>
                <ProviderActions
                  restoreLabel={t("identity_fingerprint.restore_defaults")}
                  saveLabel={
                    saving ? t("identity_fingerprint.saving") : t("identity_fingerprint.save_kimi")
                  }
                  onRestore={restoreKimiDefaults}
                  onSave={() => void saveKimi()}
                  disabled={loading || saving}
                />
              </SimplePanel>

              <SimplePanel
                title={t("identity_fingerprint.preview_title")}
                description={t("identity_fingerprint.kimi_preview_desc")}
              >
                <div className="space-y-2">
                  {kimiPreviewItems.map(([label, value]) => (
                    <PreviewRow key={label} label={label} value={value} />
                  ))}
                </div>
                <ProviderNotice>{t("identity_fingerprint.kimi_notice")}</ProviderNotice>
              </SimplePanel>
            </div>
          </TabsContent>
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

function ProviderActions({
  restoreLabel,
  saveLabel,
  onRestore,
  onSave,
  disabled,
}: {
  restoreLabel: string;
  saveLabel: string;
  onRestore: () => void;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onRestore} disabled={disabled}>
        {restoreLabel}
      </Button>
      <Button onClick={onSave} disabled={disabled}>
        {saveLabel}
      </Button>
    </div>
  );
}

function ProviderNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
      {children}
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
      {hint ? (
        <span className="block text-xs text-slate-500 dark:text-white/45">{hint}</span>
      ) : null}
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
