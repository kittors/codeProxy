import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Trash2 } from "lucide-react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { configFileApi } from "@code-proxy/api-client/endpoints/config-file";
import {
  identityFingerprintApi,
  type ClaudeIdentityFingerprint,
  type CodexFingerprintRecommendation,
  type CodexIdentityFingerprint,
  type GeminiIdentityFingerprint,
  type IdentityFingerprintEffectiveRecord,
  type IdentityFingerprintLearnedRecord,
  type IdentityFingerprintProvider,
  type IdentityFingerprintProviderStatus,
  type IdentityFingerprintConfig,
  type XAIIdentityFingerprint,
} from "@code-proxy/api-client/endpoints/identity-fingerprint";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Select } from "@code-proxy/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { CodexRecommendationsModal } from "./CodexRecommendationsModal";

type ProviderTab = "codex" | "claude" | "gemini" | "xai" | "kimi";
type RuntimeProvider = IdentityFingerprintProvider;

type ProviderRuntimeMap<T> = Record<RuntimeProvider, T[]>;
type ProviderStatusMap = Record<RuntimeProvider, IdentityFingerprintProviderStatus>;

const PROVIDERS: Array<{ id: ProviderTab; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "xai", label: "xAI" },
  { id: "kimi", label: "Kimi" },
];

const EMPTY_RUNTIME_RECORDS: ProviderRuntimeMap<IdentityFingerprintLearnedRecord> = {
  claude: [],
  codex: [],
  gemini: [],
  xai: [],
};

const EMPTY_EFFECTIVE_RECORDS: ProviderRuntimeMap<IdentityFingerprintEffectiveRecord> = {
  claude: [],
  codex: [],
  gemini: [],
  xai: [],
};

const EMPTY_PROVIDER_STATUS: ProviderStatusMap = {
  claude: { enabled: false, learned_count: 0 },
  codex: { enabled: false, learned_count: 0 },
  gemini: { enabled: false, learned_count: 0 },
  xai: { enabled: false, learned_count: 0 },
};

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
  "x-codex-beta-features": "",
  "session-mode": "per-request",
  "session-id": "",
  "custom-headers": {},
};

const EMPTY_CLAUDE: Required<ClaudeIdentityFingerprint> = {
  enabled: false,
  "cli-version": "",
  entrypoint: "",
  "user-agent": "",
  "anthropic-beta": "",
  "stainless-package-version": "",
  "stainless-runtime-version": "",
  "stainless-timeout": "",
  "session-mode": "per-request",
  "session-id": "",
  "device-id": "",
  "custom-headers": {},
};

const EMPTY_GEMINI: Required<GeminiIdentityFingerprint> = {
  enabled: false,
  "user-agent": "",
  "x-goog-api-client": "",
  "client-metadata": "",
  "custom-headers": {},
};

const EMPTY_XAI: Required<XAIIdentityFingerprint> = {
  enabled: false,
  "user-agent": "",
  "x-grok-conv-id": "",
  "custom-headers": {},
};

const PROVIDER_FIELD_ORDER: Record<RuntimeProvider, string[]> = {
  claude: [
    "user-agent",
    "cli-version",
    "entrypoint",
    "anthropic-beta",
    "stainless-package-version",
    "stainless-runtime-version",
    "stainless-timeout",
  ],
  codex: ["user-agent", "version", "originator", "websocket-beta", "x-codex-beta-features"],
  gemini: ["user-agent", "x-goog-api-client", "client-metadata"],
  xai: ["user-agent", "x-grok-conv-id"],
};

const FIELD_LABEL_KEYS: Record<string, string> = {
  "user-agent": "identity_fingerprint.user_agent",
  version: "identity_fingerprint.version",
  originator: "identity_fingerprint.originator",
  "websocket-beta": "identity_fingerprint.websocket_beta",
  "x-codex-beta-features": "identity_fingerprint.codex_beta_features",
  "cli-version": "identity_fingerprint.claude_cli_version",
  entrypoint: "identity_fingerprint.claude_entrypoint",
  "anthropic-beta": "identity_fingerprint.claude_anthropic_beta",
  "stainless-package-version": "identity_fingerprint.claude_stainless_package_version",
  "stainless-runtime-version": "identity_fingerprint.claude_stainless_runtime_version",
  "stainless-timeout": "identity_fingerprint.claude_stainless_timeout",
  "x-goog-api-client": "identity_fingerprint.gemini_api_client",
  "client-metadata": "identity_fingerprint.gemini_client_metadata",
  "x-grok-conv-id": "identity_fingerprint.xai_grok_conversation_id",
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

function mergeGemini(
  base: GeminiIdentityFingerprint | undefined,
): Required<GeminiIdentityFingerprint> {
  return {
    ...EMPTY_GEMINI,
    ...base,
    "custom-headers": base?.["custom-headers"] ?? {},
  };
}

function mergeXAI(base: XAIIdentityFingerprint | undefined): Required<XAIIdentityFingerprint> {
  return {
    ...EMPTY_XAI,
    ...base,
    "custom-headers": base?.["custom-headers"] ?? {},
  };
}

function mergeRuntimeRecords<T>(
  input: Partial<Record<RuntimeProvider, T[]>> | undefined,
  empty: ProviderRuntimeMap<T>,
): ProviderRuntimeMap<T> {
  return {
    claude: input?.claude ?? empty.claude,
    codex: input?.codex ?? empty.codex,
    gemini: input?.gemini ?? empty.gemini,
    xai: input?.xai ?? empty.xai,
  };
}

function mergeProviderStatus(
  input: Partial<Record<RuntimeProvider, IdentityFingerprintProviderStatus>> | undefined,
): ProviderStatusMap {
  return {
    claude: input?.claude ?? EMPTY_PROVIDER_STATUS.claude,
    codex: input?.codex ?? EMPTY_PROVIDER_STATUS.codex,
    gemini: input?.gemini ?? EMPTY_PROVIDER_STATUS.gemini,
    xai: input?.xai ?? EMPTY_PROVIDER_STATUS.xai,
  };
}

function withoutManagedCodexBetaFeatures(headers: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== "x-codex-beta-features"),
  );
}

function readManagedCodexBetaFeatures(headers: Record<string, string> | undefined) {
  return Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === "x-codex-beta-features",
  )?.[1];
}

function codexFromRecommendation(
  current: Required<CodexIdentityFingerprint>,
  recommendation: CodexFingerprintRecommendation,
): Required<CodexIdentityFingerprint> {
  const recommended = recommendation.recommended;
  const betaFeatures =
    recommended["x-codex-beta-features"] ||
    readManagedCodexBetaFeatures(recommended["custom-headers"]);
  const nextCustomHeaders = withoutManagedCodexBetaFeatures(recommended["custom-headers"]);
  const next: Required<CodexIdentityFingerprint> = {
    ...current,
    enabled: true,
    "session-mode": recommended["session-mode"] ?? "per-request",
    "session-id": "",
    "custom-headers": nextCustomHeaders,
  };
  if (recommended["user-agent"]) next["user-agent"] = recommended["user-agent"];
  if (recommended.version) next.version = recommended.version;
  if (recommended.originator) next.originator = recommended.originator;
  if (recommended["websocket-beta"]) next["websocket-beta"] = recommended["websocket-beta"];
  if (betaFeatures) next["x-codex-beta-features"] = betaFeatures;
  return next;
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

function orderedFieldEntries(
  provider: RuntimeProvider,
  fields: Record<string, { value: string; source: string }>,
) {
  const seen = new Set<string>();
  const ordered: Array<[string, { value: string; source: string }]> = [];
  for (const key of PROVIDER_FIELD_ORDER[provider]) {
    const value = fields[key];
    if (value) {
      ordered.push([key, value]);
      seen.add(key);
    }
  }
  for (const entry of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    if (!seen.has(entry[0])) ordered.push(entry);
  }
  return ordered;
}

function orderedStringEntries(provider: RuntimeProvider, fields: Record<string, string>) {
  const seen = new Set<string>();
  const ordered: Array<[string, string]> = [];
  for (const key of PROVIDER_FIELD_ORDER[provider]) {
    const value = fields[key];
    if (value) {
      ordered.push([key, value]);
      seen.add(key);
    }
  }
  for (const entry of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    if (!seen.has(entry[0]) && entry[1]) ordered.push(entry);
  }
  return ordered;
}

function providerLabel(provider: RuntimeProvider) {
  switch (provider) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "gemini":
      return "Gemini";
    case "xai":
      return "xAI";
  }
}

function formatTimestamp(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
  const [geminiFingerprint, setGeminiFingerprint] =
    useState<Required<GeminiIdentityFingerprint>>(EMPTY_GEMINI);
  const [geminiDefaults, setGeminiDefaults] =
    useState<Required<GeminiIdentityFingerprint>>(EMPTY_GEMINI);
  const [xaiFingerprint, setXAIFingerprint] = useState<Required<XAIIdentityFingerprint>>(EMPTY_XAI);
  const [xaiDefaults, setXAIDefaults] = useState<Required<XAIIdentityFingerprint>>(EMPTY_XAI);
  const [configYaml, setConfigYaml] = useState("");
  const [kimi, setKimi] = useState<KimiHeaderDefaults>(DEFAULT_KIMI_HEADERS);
  const [geminiHeadersText, setGeminiHeadersText] = useState(
    JSON.stringify(DEFAULT_GEMINI_HEADERS, null, 2),
  );
  const [geminiKeyCount, setGeminiKeyCount] = useState(0);
  const [customHeadersText, setCustomHeadersText] = useState("{}");
  const [claudeCustomHeadersText, setClaudeCustomHeadersText] = useState("{}");
  const [geminiCustomHeadersText, setGeminiCustomHeadersText] = useState("{}");
  const [xaiCustomHeadersText, setXAICustomHeadersText] = useState("{}");
  const [learnedRecords, setLearnedRecords] =
    useState<ProviderRuntimeMap<IdentityFingerprintLearnedRecord>>(EMPTY_RUNTIME_RECORDS);
  const [effectiveRecords, setEffectiveRecords] =
    useState<ProviderRuntimeMap<IdentityFingerprintEffectiveRecord>>(EMPTY_EFFECTIVE_RECORDS);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusMap>(EMPTY_PROVIDER_STATUS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [codexRecommendationsOpen, setCodexRecommendationsOpen] = useState(false);

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
      const nextGeminiFingerprint = mergeGemini(payload["identity-fingerprint"]?.gemini);
      const nextGeminiDefaults = mergeGemini(payload.defaults?.gemini);
      const nextXAI = mergeXAI(payload["identity-fingerprint"]?.xai);
      const nextXAIDefaults = mergeXAI(payload.defaults?.xai);
      const parsedConfig = parseConfigYaml(yamlText);
      const gemini = firstGeminiHeaders(parsedConfig["gemini-api-key"]);
      setCodex(nextCodex);
      setDefaults(nextDefaults);
      setClaude(nextClaude);
      setClaudeDefaults(nextClaudeDefaults);
      setGeminiFingerprint(nextGeminiFingerprint);
      setGeminiDefaults(nextGeminiDefaults);
      setXAIFingerprint(nextXAI);
      setXAIDefaults(nextXAIDefaults);
      setConfigYaml(yamlText);
      setKimi(normalizeKimiHeaders(parsedConfig["kimi-header-defaults"]));
      setGeminiHeadersText(JSON.stringify(gemini.headers, null, 2));
      setGeminiKeyCount(gemini.count);
      setCustomHeadersText(JSON.stringify(nextCodex["custom-headers"], null, 2));
      setClaudeCustomHeadersText(JSON.stringify(nextClaude["custom-headers"], null, 2));
      setGeminiCustomHeadersText(JSON.stringify(nextGeminiFingerprint["custom-headers"], null, 2));
      setXAICustomHeadersText(JSON.stringify(nextXAI["custom-headers"], null, 2));
      setLearnedRecords(mergeRuntimeRecords(payload.learned, EMPTY_RUNTIME_RECORDS));
      setEffectiveRecords(mergeRuntimeRecords(payload.effective, EMPTY_EFFECTIVE_RECORDS));
      setProviderStatus(mergeProviderStatus(payload.status));
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

  const updateGeminiFingerprint = useCallback((patch: Partial<GeminiIdentityFingerprint>) => {
    setGeminiFingerprint((current) => ({ ...current, ...patch }));
  }, []);

  const updateXAIFingerprint = useCallback((patch: Partial<XAIIdentityFingerprint>) => {
    setXAIFingerprint((current) => ({ ...current, ...patch }));
  }, []);

  const parsedCodexCustomHeaders = useMemo(() => {
    try {
      return parseCustomHeaders(customHeadersText);
    } catch {
      return codex["custom-headers"];
    }
  }, [codex, customHeadersText]);

  const restoreDefaults = useCallback(() => {
    setCodex(defaults);
    setCustomHeadersText(JSON.stringify(defaults["custom-headers"], null, 2));
  }, [defaults]);

  const restoreClaudeDefaults = useCallback(() => {
    setClaude(claudeDefaults);
    setClaudeCustomHeadersText(JSON.stringify(claudeDefaults["custom-headers"], null, 2));
  }, [claudeDefaults]);

  const restoreGeminiFingerprintDefaults = useCallback(() => {
    setGeminiFingerprint(geminiDefaults);
    setGeminiCustomHeadersText(JSON.stringify(geminiDefaults["custom-headers"], null, 2));
  }, [geminiDefaults]);

  const restoreXAIDefaults = useCallback(() => {
    setXAIFingerprint(xaiDefaults);
    setXAICustomHeadersText(JSON.stringify(xaiDefaults["custom-headers"], null, 2));
  }, [xaiDefaults]);

  const restoreGeminiDefaults = useCallback(() => {
    setGeminiHeadersText(JSON.stringify(DEFAULT_GEMINI_HEADERS, null, 2));
  }, []);

  const restoreKimiDefaults = useCallback(() => {
    setKimi(DEFAULT_KIMI_HEADERS);
  }, []);

  const applyCodexRecommendation = useCallback(
    async (recommendation: CodexFingerprintRecommendation) => {
      const nextCodex = codexFromRecommendation(codex, recommendation);
      const nextCustomHeaders = nextCodex["custom-headers"];
      setSaving(true);
      setError("");
      try {
        await identityFingerprintApi.update({
          codex: nextCodex,
          claude,
          gemini: geminiFingerprint,
          xai: xaiFingerprint,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("identity_fingerprint.save_failed");
        setError(message);
        notify({ type: "error", message });
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setSaving(false);
      }
      setCustomHeadersText(JSON.stringify(nextCustomHeaders, null, 2));
      setCodex(nextCodex);
      setCodexRecommendationsOpen(false);
      notify({ type: "success", message: t("identity_fingerprint.recommend_applied") });
      await loadPage();
    },
    [claude, codex, geminiFingerprint, loadPage, notify, t, xaiFingerprint],
  );

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
        gemini: geminiFingerprint,
        xai: xaiFingerprint,
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
  }, [claude, codex, customHeadersText, geminiFingerprint, loadPage, notify, t, xaiFingerprint]);

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
        gemini: geminiFingerprint,
        xai: xaiFingerprint,
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
  }, [
    claude,
    claudeCustomHeadersText,
    codex,
    geminiFingerprint,
    loadPage,
    notify,
    t,
    xaiFingerprint,
  ]);

  const saveGeminiFingerprint = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const customHeaders = parseCustomHeaders(geminiCustomHeadersText);
      const payload: IdentityFingerprintConfig = {
        codex,
        claude,
        gemini: {
          ...geminiFingerprint,
          "custom-headers": customHeaders,
        },
        xai: xaiFingerprint,
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
  }, [
    claude,
    codex,
    geminiCustomHeadersText,
    geminiFingerprint,
    loadPage,
    notify,
    t,
    xaiFingerprint,
  ]);

  const saveXAI = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const customHeaders = parseCustomHeaders(xaiCustomHeadersText);
      const payload: IdentityFingerprintConfig = {
        codex,
        claude,
        gemini: geminiFingerprint,
        xai: {
          ...xaiFingerprint,
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
  }, [claude, codex, geminiFingerprint, loadPage, notify, t, xaiCustomHeadersText, xaiFingerprint]);

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

  const clearLearnedRecord = useCallback(
    async (provider: RuntimeProvider, accountKey: string) => {
      setSaving(true);
      setError("");
      try {
        await identityFingerprintApi.deleteLearned(provider, accountKey);
        notify({ type: "success", message: t("identity_fingerprint.learned_deleted") });
        await loadPage();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t("identity_fingerprint.learned_delete_failed");
        setError(message);
        notify({ type: "error", message });
      } finally {
        setSaving(false);
      }
    },
    [loadPage, notify, t],
  );

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
      [t("identity_fingerprint.codex_beta_features"), codex["x-codex-beta-features"]],
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

  const geminiPreviewItems = useMemo(
    () => [
      [t("identity_fingerprint.preview_client"), geminiFingerprint["user-agent"]],
      [t("identity_fingerprint.gemini_api_client"), geminiFingerprint["x-goog-api-client"]],
      [t("identity_fingerprint.gemini_client_metadata"), geminiFingerprint["client-metadata"]],
    ],
    [geminiFingerprint, t],
  );

  const xaiPreviewItems = useMemo(
    () => [
      [t("identity_fingerprint.preview_client"), xaiFingerprint["user-agent"]],
      [t("identity_fingerprint.xai_grok_conversation_id"), xaiFingerprint["x-grok-conv-id"]],
    ],
    [t, xaiFingerprint],
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
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <ToggleSwitch
                    checked={Boolean(codex.enabled)}
                    onCheckedChange={(enabled) => updateCodex({ enabled })}
                    label={t("identity_fingerprint.codex_enabled")}
                    description={t("identity_fingerprint.codex_enabled_desc")}
                    disabled={saving}
                  />
                  <div className="flex w-full flex-wrap gap-2 2xl:w-auto 2xl:justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setCodexRecommendationsOpen(true)}
                      disabled={loading || saving}
                    >
                      <Sparkles size={15} />
                      {t("identity_fingerprint.recommend_open")}
                    </Button>
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.websocket_beta")}>
                        <TextInput
                          value={codex["websocket-beta"]}
                          onChange={(event) =>
                            updateCodex({ "websocket-beta": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.codex_beta_features")}>
                        <TextInput
                          value={codex["x-codex-beta-features"]}
                          onChange={(event) =>
                            updateCodex({ "x-codex-beta-features": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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

                <div className="space-y-4">
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
                  <RuntimeStatePanel
                    provider="codex"
                    status={providerStatus.codex}
                    learned={learnedRecords.codex}
                    effective={effectiveRecords.codex}
                    disabled={saving}
                    onClear={clearLearnedRecord}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="claude" className="mt-5">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/45">
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <ToggleSwitch
                    checked={Boolean(claude.enabled)}
                    onCheckedChange={(enabled) => updateClaude({ enabled })}
                    label={t("identity_fingerprint.claude_enabled")}
                    description={t("identity_fingerprint.claude_enabled_desc")}
                    disabled={saving}
                  />
                  <div className="flex w-full flex-wrap gap-2 2xl:w-auto 2xl:justify-end">
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.claude_entrypoint")}>
                        <TextInput
                          value={claude.entrypoint}
                          onChange={(event) => updateClaude({ entrypoint: event.target.value })}
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.claude_anthropic_beta")}>
                        <TextInput
                          value={claude["anthropic-beta"]}
                          onChange={(event) =>
                            updateClaude({ "anthropic-beta": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.claude_stainless_runtime_version")}>
                        <TextInput
                          value={claude["stainless-runtime-version"]}
                          onChange={(event) =>
                            updateClaude({ "stainless-runtime-version": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
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

                <div className="space-y-4">
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
                  <RuntimeStatePanel
                    provider="claude"
                    status={providerStatus.claude}
                    learned={learnedRecords.claude}
                    effective={effectiveRecords.claude}
                    disabled={saving}
                    onClear={clearLearnedRecord}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="gemini" className="mt-5">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/45">
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <ToggleSwitch
                    checked={Boolean(geminiFingerprint.enabled)}
                    onCheckedChange={(enabled) => updateGeminiFingerprint({ enabled })}
                    label={t("identity_fingerprint.gemini_enabled")}
                    description={t("identity_fingerprint.gemini_enabled_desc")}
                    disabled={saving}
                  />
                  <div className="flex w-full flex-wrap gap-2 2xl:w-auto 2xl:justify-end">
                    <Button
                      variant="secondary"
                      onClick={restoreGeminiFingerprintDefaults}
                      disabled={loading || saving}
                    >
                      {t("identity_fingerprint.restore_defaults")}
                    </Button>
                    <Button
                      onClick={() => void saveGeminiFingerprint()}
                      disabled={loading || saving}
                    >
                      {saving
                        ? t("identity_fingerprint.saving")
                        : t("identity_fingerprint.save_gemini_fingerprint")}
                    </Button>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <SimplePanel
                    title={t("identity_fingerprint.gemini_fingerprint_title")}
                    description={t("identity_fingerprint.gemini_fingerprint_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label={t("identity_fingerprint.user_agent")}
                        hint={t("identity_fingerprint.gemini_user_agent_hint")}
                      >
                        <TextInput
                          value={geminiFingerprint["user-agent"]}
                          onChange={(event) =>
                            updateGeminiFingerprint({ "user-agent": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field label={t("identity_fingerprint.gemini_api_client")}>
                        <TextInput
                          value={geminiFingerprint["x-goog-api-client"]}
                          onChange={(event) =>
                            updateGeminiFingerprint({
                              "x-goog-api-client": event.target.value,
                            })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                    </div>
                    <Field label={t("identity_fingerprint.gemini_client_metadata")}>
                      <TextInput
                        value={geminiFingerprint["client-metadata"]}
                        onChange={(event) =>
                          updateGeminiFingerprint({ "client-metadata": event.target.value })
                        }
                        disabled={saving}
                        placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                      />
                    </Field>
                    <Field label={t("identity_fingerprint.custom_headers")}>
                      <textarea
                        value={geminiCustomHeadersText}
                        onChange={(event) => setGeminiCustomHeadersText(event.target.value)}
                        disabled={saving}
                        spellCheck={false}
                        className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                        {t("identity_fingerprint.gemini_custom_headers_hint")}
                      </p>
                    </Field>
                  </SimplePanel>

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
                </div>

                <div className="space-y-4">
                  <SimplePanel
                    title={t("identity_fingerprint.preview_title")}
                    description={t("identity_fingerprint.gemini_preview_desc")}
                  >
                    <div className="space-y-2">
                      {geminiPreviewItems.map(([label, value]) => (
                        <PreviewRow key={label} label={label} value={value} />
                      ))}
                      <PreviewRow
                        label={t("identity_fingerprint.gemini_key_count")}
                        value={t("identity_fingerprint.gemini_key_count_value", {
                          count: geminiKeyCount,
                        })}
                      />
                    </div>
                    <ProviderNotice>
                      {geminiKeyCount > 0
                        ? t("identity_fingerprint.gemini_notice")
                        : t("identity_fingerprint.gemini_empty_notice")}
                    </ProviderNotice>
                  </SimplePanel>
                  <RuntimeStatePanel
                    provider="gemini"
                    status={providerStatus.gemini}
                    learned={learnedRecords.gemini}
                    effective={effectiveRecords.gemini}
                    disabled={saving}
                    onClear={clearLearnedRecord}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="xai" className="mt-5">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/45">
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <ToggleSwitch
                    checked={Boolean(xaiFingerprint.enabled)}
                    onCheckedChange={(enabled) => updateXAIFingerprint({ enabled })}
                    label={t("identity_fingerprint.xai_enabled")}
                    description={t("identity_fingerprint.xai_enabled_desc")}
                    disabled={saving}
                  />
                  <div className="flex w-full flex-wrap gap-2 2xl:w-auto 2xl:justify-end">
                    <Button
                      variant="secondary"
                      onClick={restoreXAIDefaults}
                      disabled={loading || saving}
                    >
                      {t("identity_fingerprint.restore_defaults")}
                    </Button>
                    <Button onClick={() => void saveXAI()} disabled={loading || saving}>
                      {saving
                        ? t("identity_fingerprint.saving")
                        : t("identity_fingerprint.save_xai")}
                    </Button>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <SimplePanel
                    title={t("identity_fingerprint.xai_title")}
                    description={t("identity_fingerprint.xai_desc")}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label={t("identity_fingerprint.user_agent")}
                        hint={t("identity_fingerprint.xai_user_agent_hint")}
                      >
                        <TextInput
                          value={xaiFingerprint["user-agent"]}
                          onChange={(event) =>
                            updateXAIFingerprint({ "user-agent": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                      <Field
                        label={t("identity_fingerprint.xai_grok_conversation_id")}
                        hint={t("identity_fingerprint.xai_grok_conversation_id_hint")}
                      >
                        <TextInput
                          value={xaiFingerprint["x-grok-conv-id"]}
                          onChange={(event) =>
                            updateXAIFingerprint({ "x-grok-conv-id": event.target.value })
                          }
                          disabled={saving}
                          placeholder={t("identity_fingerprint.auto_learn_placeholder")}
                        />
                      </Field>
                    </div>
                    <Field label={t("identity_fingerprint.custom_headers")}>
                      <textarea
                        value={xaiCustomHeadersText}
                        onChange={(event) => setXAICustomHeadersText(event.target.value)}
                        disabled={saving}
                        spellCheck={false}
                        className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/50">
                        {t("identity_fingerprint.xai_custom_headers_hint")}
                      </p>
                    </Field>
                  </SimplePanel>
                </div>

                <div className="space-y-4">
                  <SimplePanel
                    title={t("identity_fingerprint.preview_title")}
                    description={t("identity_fingerprint.xai_preview_desc")}
                  >
                    <div className="space-y-2">
                      {xaiPreviewItems.map(([label, value]) => (
                        <PreviewRow key={label} label={label} value={value} />
                      ))}
                    </div>
                    <ProviderNotice>{t("identity_fingerprint.xai_notice")}</ProviderNotice>
                  </SimplePanel>
                  <RuntimeStatePanel
                    provider="xai"
                    status={providerStatus.xai}
                    learned={learnedRecords.xai}
                    effective={effectiveRecords.xai}
                    disabled={saving}
                    onClear={clearLearnedRecord}
                  />
                </div>
              </div>
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
      <CodexRecommendationsModal
        open={codexRecommendationsOpen}
        current={codex}
        currentCustomHeaders={parsedCodexCustomHeaders}
        onApply={applyCodexRecommendation}
        onClose={() => setCodexRecommendationsOpen(false)}
      />
    </div>
  );
}

function RuntimeStatePanel({
  provider,
  status,
  learned,
  effective,
  disabled,
  onClear,
}: {
  provider: RuntimeProvider;
  status: IdentityFingerprintProviderStatus;
  learned: IdentityFingerprintLearnedRecord[];
  effective: IdentityFingerprintEffectiveRecord[];
  disabled?: boolean;
  onClear: (provider: RuntimeProvider, accountKey: string) => void;
}) {
  const { t } = useTranslation();
  const label = providerLabel(provider);
  return (
    <SimplePanel
      title={t("identity_fingerprint.learned_title", { provider: label })}
      description={t("identity_fingerprint.learned_desc")}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <SourcePill tone={status.enabled ? "learned" : "default"}>
          {status.enabled
            ? t("identity_fingerprint.status_enabled")
            : t("identity_fingerprint.status_disabled")}
        </SourcePill>
        <span className="text-slate-500 dark:text-white/50">
          {t("identity_fingerprint.learned_count", {
            count: status.learned_count ?? learned.length,
          })}
        </span>
      </div>

      {effective.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-white/45">
            {t("identity_fingerprint.effective_title")}
          </h4>
          {effective.map((record, index) => (
            <div
              key={`${record.account_key || "default"}-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/60"
            >
              <RecordHeader
                accountKey={record.account_key}
                authSubjectId={record.auth_subject_id}
                product={record.client_product}
                version={record.version}
              />
              <div className="mt-3 space-y-2">
                {orderedFieldEntries(provider, record.fields).map(([field, fieldValue]) => (
                  <div key={field} className="rounded-lg bg-white px-3 py-2 dark:bg-neutral-950">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600 dark:text-white/60">
                        {t(FIELD_LABEL_KEYS[field] ?? field)}
                      </span>
                      <SourceBadge source={fieldValue.source} />
                    </div>
                    <div className="mt-1 break-all text-xs text-slate-900 dark:text-white">
                      {fieldValue.value || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-neutral-900/70 dark:text-white/50">
          {t("identity_fingerprint.no_effective_records")}
        </p>
      )}

      {learned.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-white/45">
            {t("identity_fingerprint.learned_records_title")}
          </h4>
          {learned.map((record) => (
            <div
              key={record.account_key}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <RecordHeader
                  accountKey={record.account_key}
                  authSubjectId={record.auth_subject_id}
                  product={record.client_product}
                  variant={record.client_variant}
                  version={record.version}
                />
                <Button
                  variant="secondary"
                  onClick={() => onClear(provider, record.account_key)}
                  disabled={disabled}
                >
                  <Trash2 size={14} />
                  {t("identity_fingerprint.clear_learned")}
                </Button>
              </div>
              <PreviewRow
                label={t("identity_fingerprint.last_seen")}
                value={formatTimestamp(record.last_seen_at)}
              />
              <KeyValueList
                title={t("identity_fingerprint.learned_fields")}
                entries={orderedStringEntries(provider, record.fields)}
              />
              <KeyValueList
                title={t("identity_fingerprint.observed_headers")}
                entries={Object.entries(record.observed_headers ?? {}).sort(([a], [b]) =>
                  a.localeCompare(b),
                )}
              />
            </div>
          ))}
        </div>
      ) : null}
    </SimplePanel>
  );
}

function RecordHeader({
  accountKey,
  authSubjectId,
  product,
  variant,
  version,
}: {
  accountKey?: string;
  authSubjectId?: string;
  product?: string;
  variant?: string;
  version?: string;
}) {
  const { t } = useTranslation();
  const productLine = [product, variant, version].filter(Boolean).join(" / ");
  return (
    <div className="min-w-0">
      <div className="break-all text-xs font-semibold text-slate-900 dark:text-white">
        {accountKey || t("identity_fingerprint.default_account")}
      </div>
      {authSubjectId ? (
        <div className="mt-1 break-all text-xs text-slate-500 dark:text-white/50">
          {authSubjectId}
        </div>
      ) : null}
      {productLine ? (
        <div className="mt-1 break-all text-xs text-slate-500 dark:text-white/50">
          {productLine}
        </div>
      ) : null}
    </div>
  );
}

function KeyValueList({ title, entries }: { title: string; entries: Array<[string, string]> }) {
  if (entries.length === 0) return null;
  return (
    <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-neutral-900">
      <summary className="cursor-pointer font-semibold text-slate-600 dark:text-white/60">
        {title}
      </summary>
      <div className="mt-2 space-y-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <div className="font-semibold text-slate-500 dark:text-white/45">{key}</div>
            <div className="break-all text-slate-900 dark:text-white">{value || "-"}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation();
  if (source === "custom" || source === "preset") {
    return <SourcePill tone="custom">{t("identity_fingerprint.source_custom")}</SourcePill>;
  }
  if (source === "learned") {
    return <SourcePill tone="learned">{t("identity_fingerprint.source_learned")}</SourcePill>;
  }
  if (source === "default" || source === "builtin_default") {
    return <SourcePill tone="default">{t("identity_fingerprint.source_default")}</SourcePill>;
  }
  return <SourcePill tone="default">{t("identity_fingerprint.source_default")}</SourcePill>;
}

function SourcePill({
  tone,
  children,
}: {
  tone: "custom" | "learned" | "default";
  children: ReactNode;
}) {
  const className =
    tone === "custom"
      ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"
      : tone === "learned"
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
        : "bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-white/60";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
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
