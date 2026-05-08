import type { CcSwitchClientType } from "@/modules/ccswitch/ccswitchImport";

export type CcSwitchClaudeAuthField = "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN";

export const CC_SWITCH_CLAUDE_AUTH_FIELDS: CcSwitchClaudeAuthField[] = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
];

export interface CcSwitchClientImportSettings {
  endpointPath: string;
  defaultModel: string;
  usageAutoInterval: number;
  apiKeyField?: CcSwitchClaudeAuthField;
}

export type CcSwitchImportSettings = Record<CcSwitchClientType, CcSwitchClientImportSettings>;
export type CcSwitchImportSettingsInput = Partial<
  Record<CcSwitchClientType, Partial<CcSwitchClientImportSettings>>
>;

export const DEFAULT_CC_SWITCH_IMPORT_SETTINGS: CcSwitchImportSettings = {
  claude: {
    endpointPath: "",
    defaultModel: "",
    usageAutoInterval: 30,
    apiKeyField: "ANTHROPIC_API_KEY",
  },
  codex: {
    endpointPath: "/v1",
    defaultModel: "gpt-5.5",
    usageAutoInterval: 30,
  },
  gemini: {
    endpointPath: "",
    defaultModel: "",
    usageAutoInterval: 30,
  },
};

const CLIENT_TYPES: CcSwitchClientType[] = ["claude", "codex", "gemini"];

export function normalizeCcSwitchEndpointPath(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

export function normalizeCcSwitchClaudeAuthField(value: unknown): CcSwitchClaudeAuthField {
  return value === "ANTHROPIC_AUTH_TOKEN" ? "ANTHROPIC_AUTH_TOKEN" : "ANTHROPIC_API_KEY";
}

function normalizeUsageAutoInterval(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export function normalizeCcSwitchImportSettings(
  input?: CcSwitchImportSettingsInput | null,
): CcSwitchImportSettings {
  const result = { ...DEFAULT_CC_SWITCH_IMPORT_SETTINGS } as CcSwitchImportSettings;

  for (const clientType of CLIENT_TYPES) {
    const defaults = DEFAULT_CC_SWITCH_IMPORT_SETTINGS[clientType];
    const rawValue = input?.[clientType];
    const raw =
      rawValue && typeof rawValue === "object"
        ? (rawValue as Partial<CcSwitchClientImportSettings>)
        : {};
    result[clientType] = {
      endpointPath:
        "endpointPath" in raw
          ? normalizeCcSwitchEndpointPath(raw.endpointPath)
          : defaults.endpointPath,
      defaultModel:
        "defaultModel" in raw ? String(raw.defaultModel ?? "").trim() : defaults.defaultModel,
      usageAutoInterval: normalizeUsageAutoInterval(
        "usageAutoInterval" in raw ? raw.usageAutoInterval : defaults.usageAutoInterval,
        defaults.usageAutoInterval,
      ),
      ...(clientType === "claude"
        ? {
            apiKeyField: normalizeCcSwitchClaudeAuthField(
              "apiKeyField" in raw ? raw.apiKeyField : defaults.apiKeyField,
            ),
          }
        : {}),
    };
  }

  return result;
}
