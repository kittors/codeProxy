import type { CcSwitchClientType } from "@/modules/ccswitch/ccswitchImport";

export const CC_SWITCH_IMPORT_SETTINGS_STORAGE_KEY = "ccswitch.importSettings.v1";

export interface CcSwitchClientImportSettings {
  endpointPath: string;
  defaultModel: string;
  usageAutoInterval: number;
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
    };
  }

  return result;
}

export function readCcSwitchImportSettings(): CcSwitchImportSettings {
  try {
    if (typeof window === "undefined") return normalizeCcSwitchImportSettings();
    const raw = window.localStorage.getItem(CC_SWITCH_IMPORT_SETTINGS_STORAGE_KEY);
    if (!raw) return normalizeCcSwitchImportSettings();
    return normalizeCcSwitchImportSettings(JSON.parse(raw) as CcSwitchImportSettingsInput);
  } catch {
    return normalizeCcSwitchImportSettings();
  }
}

export function writeCcSwitchImportSettings(
  settings: CcSwitchImportSettingsInput,
): CcSwitchImportSettings {
  const normalized = normalizeCcSwitchImportSettings(settings);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        CC_SWITCH_IMPORT_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalized),
      );
    }
  } catch {
    // Ignore storage failures; callers still receive normalized settings.
  }
  return normalized;
}

export function resetCcSwitchImportSettings(): CcSwitchImportSettings {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CC_SWITCH_IMPORT_SETTINGS_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
  return normalizeCcSwitchImportSettings();
}
