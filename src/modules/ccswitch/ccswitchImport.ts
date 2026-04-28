import { normalizeApiBase } from "@/lib/connection";

export type CcSwitchClientType = "claude" | "codex" | "gemini";

export interface CcSwitchClientConfig {
  type: CcSwitchClientType;
  app: string;
  icon: string;
  labelKey: string;
  descriptionKey: string;
  fallbackLabel: string;
}

export const CC_SWITCH_CLIENTS: CcSwitchClientConfig[] = [
  {
    type: "claude",
    app: "claude",
    icon: "claude",
    labelKey: "ccswitch.client_claude_code",
    descriptionKey: "ccswitch.client_claude_code_desc",
    fallbackLabel: "Claude Code",
  },
  {
    type: "codex",
    app: "codex",
    icon: "openai",
    labelKey: "ccswitch.client_codex",
    descriptionKey: "ccswitch.client_codex_desc",
    fallbackLabel: "Codex",
  },
  {
    type: "gemini",
    app: "gemini",
    icon: "gemini",
    labelKey: "ccswitch.client_gemini_cli",
    descriptionKey: "ccswitch.client_gemini_cli_desc",
    fallbackLabel: "Gemini CLI",
  },
];

const CLIENT_BY_TYPE = new Map(CC_SWITCH_CLIENTS.map((client) => [client.type, client]));

const MODEL_PRIORITY: Record<CcSwitchClientType, string[]> = {
  claude: ["claude-sonnet", "claude-opus", "claude-haiku", "claude"],
  codex: ["gpt-5.3-codex", "gpt-5-codex", "codex", "gpt-5", "gpt-4.1", "gpt-4", "o4", "o3"],
  gemini: ["gemini-3", "gemini-2.5-pro", "gemini-2.5-flash", "gemini"],
};

export function getCcSwitchClientConfig(type: CcSwitchClientType): CcSwitchClientConfig {
  return CLIENT_BY_TYPE.get(type) ?? CC_SWITCH_CLIENTS[0]!;
}

export function normalizeCcSwitchBaseUrl(input: string): string {
  return normalizeApiBase(input).replace(/\/+$/, "");
}

const encodeBase64 = (value: string): string => {
  if (typeof btoa === "function") return btoa(value);
  const buffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => unknown } })
    .Buffer;
  if (buffer?.from) {
    const bytes = buffer.from(value, "utf-8") as { toString: (encoding: string) => string };
    return bytes.toString("base64");
  }
  throw new Error("Base64 encoder is unavailable");
};

export function buildCcSwitchUsageScript(): string {
  return `({
  request: {
    url: "{{baseUrl}}/v0/management/public/usage",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: "{{apiKey}}" })
  },
  extractor: function(response) {
    var usage = response && response.usage ? response.usage : {};
    var apis = usage.apis || {};
    var keys = Object.keys(apis);
    var item = keys.length > 0 ? apis[keys[0]] || {} : {};
    var requests = Number(item.total_requests || usage.total_requests || 0) || 0;
    var tokens = Number(item.total_tokens || usage.total_tokens || 0) || 0;
    return {
      planName: "CliProxy",
      isValid: response && response.found === false ? false : true,
      used: requests,
      remaining: null,
      unit: "requests",
      extra: String(tokens) + " tokens"
    };
  }
})`;
}

export function pickCcSwitchDefaultModel(
  clientType: CcSwitchClientType,
  models: readonly string[] = [],
): string | undefined {
  const normalized = models.map((model) => String(model ?? "").trim()).filter(Boolean);
  if (normalized.length === 0) return undefined;

  const priorities = MODEL_PRIORITY[clientType];
  for (const priority of priorities) {
    const match = normalized.find((model) => model.toLowerCase().includes(priority));
    if (match) return match;
  }

  return undefined;
}

export function buildCcSwitchProviderName(input: {
  rawName?: string;
  clientType: CcSwitchClientType;
}): string {
  const baseName = String(input.rawName ?? "").trim() || "CliProxy";
  const clientLabel = getCcSwitchClientConfig(input.clientType).fallbackLabel;
  return baseName.toLowerCase().includes(clientLabel.toLowerCase())
    ? baseName
    : `${baseName} ${clientLabel}`;
}

export function buildCcSwitchImportUrl(input: {
  apiKey: string;
  baseUrl: string;
  clientType: CcSwitchClientType;
  providerName: string;
  model?: string;
}): string {
  const client = getCcSwitchClientConfig(input.clientType);
  const baseUrl = normalizeCcSwitchBaseUrl(input.baseUrl);
  const params = new URLSearchParams({
    resource: "provider",
    app: client.app,
    name: input.providerName.trim() || buildCcSwitchProviderName({ clientType: input.clientType }),
    homepage: baseUrl,
    endpoint: baseUrl,
    apiKey: input.apiKey.trim(),
    icon: client.icon,
    configFormat: "json",
    usageEnabled: "true",
    usageScript: encodeBase64(buildCcSwitchUsageScript()),
    usageAutoInterval: "30",
  });

  const model = String(input.model ?? "").trim();
  if (model) {
    params.set("model", model);
  }

  return `ccswitch://v1/import?${params.toString()}`;
}

export function openCcSwitchImportUrl(
  url: string,
  options: { onProtocolUnavailable?: () => void } = {},
): void {
  try {
    window.open(url, "_self");
    window.setTimeout(() => {
      if (document.hasFocus()) {
        options.onProtocolUnavailable?.();
      }
    }, 100);
  } catch {
    options.onProtocolUnavailable?.();
  }
}
