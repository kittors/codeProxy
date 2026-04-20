import type { AuthFileItem } from "@/lib/http/types";
import type { ApiKeyFormValues } from "@/modules/api-keys/types";

import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconDeepseek from "@/assets/icons/deepseek.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconGlm from "@/assets/icons/glm.svg";
import iconGrok from "@/assets/icons/grok.svg";
import iconIflow from "@/assets/icons/iflow.svg";
import iconKimiDark from "@/assets/icons/kimi-dark.svg";
import iconKimiLight from "@/assets/icons/kimi-light.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconMinimax from "@/assets/icons/minimax.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import iconQwen from "@/assets/icons/qwen.svg";
import iconVertex from "@/assets/icons/vertex.svg";

const VENDOR_ICONS: Record<string, { light: string; dark: string }> = {
  claude: { light: iconClaude, dark: iconClaude },
  gpt: { light: iconOpenai, dark: iconOpenai },
  o1: { light: iconOpenai, dark: iconOpenai },
  o3: { light: iconOpenai, dark: iconOpenai },
  o4: { light: iconOpenai, dark: iconOpenai },
  gemini: { light: iconGemini, dark: iconGemini },
  deepseek: { light: iconDeepseek, dark: iconDeepseek },
  qwen: { light: iconQwen, dark: iconQwen },
  minimax: { light: iconMinimax, dark: iconMinimax },
  grok: { light: iconGrok, dark: iconGrok },
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  codex: { light: iconCodex, dark: iconCodex },
  glm: { light: iconGlm, dark: iconGlm },
  kiro: { light: iconKiro, dark: iconKiro },
  vertex: { light: iconVertex, dark: iconVertex },
  iflow: { light: iconIflow, dark: iconIflow },
};

export function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
  const lower = modelId.toLowerCase();
  let icons: { light: string; dark: string } | null = null;
  for (const prefix of Object.keys(VENDOR_ICONS)) {
    if (lower.startsWith(prefix)) {
      icons = VENDOR_ICONS[prefix];
      break;
    }
  }
  if (!icons) return null;
  return (
    <>
      <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
      <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
    </>
  );
}

export const makeEmptyApiKeyForm = (key = ""): ApiKeyFormValues => ({
  name: "",
  key,
  dailyLimit: "",
  totalQuota: "",
  concurrencyLimit: "",
  rpmLimit: "",
  tpmLimit: "",
  allowedModels: [],
  allowedChannels: [],
  allowedChannelGroups: [],
  useExactChannelRestrictions: false,
  systemPrompt: "",
});

export const generateApiKey = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "sk-";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

export const maskApiKey = (key: string) => {
  if (key.length <= 8) return key;
  return key.slice(0, 5) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-3);
};

export const formatApiKeyDate = (iso: string | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export const formatApiKeyLimit = (limit: number | undefined) => {
  if (!limit || limit <= 0) return null;
  return limit.toLocaleString();
};

export const normalizeChannelKey = (value: string) => value.trim().toLowerCase();

export const readAuthFileChannelName = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email, file.provider, file.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};
