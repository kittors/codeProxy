import iconAmp from "@code-proxy/assets/icons/amp.svg";
import iconAntigravity from "@code-proxy/assets/icons/antigravity.svg";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import iconDeepseek from "@code-proxy/assets/icons/deepseek.svg";
import iconGemini from "@code-proxy/assets/icons/gemini.svg";
import iconGlm from "@code-proxy/assets/icons/glm.svg";
import iconGrok from "@code-proxy/assets/icons/grok.svg";
import iconIflow from "@code-proxy/assets/icons/iflow.svg";
import iconKimiDark from "@code-proxy/assets/icons/kimi-dark.svg";
import iconKimiLight from "@code-proxy/assets/icons/kimi-light.svg";
import iconKiro from "@code-proxy/assets/icons/kiro.svg";
import iconMimo from "@code-proxy/assets/icons/mimo.svg";
import iconMinimax from "@code-proxy/assets/icons/minimax.svg";
import iconOpencodeDark from "@code-proxy/assets/icons/opencode-dark.svg";
import iconOpencodeLight from "@code-proxy/assets/icons/opencode-light.svg";
import iconOpenaiDark from "@code-proxy/assets/icons/openai-dark.svg";
import iconOpenaiLight from "@code-proxy/assets/icons/openai-light.svg";
import iconQwen from "@code-proxy/assets/icons/qwen.svg";
import iconVertex from "@code-proxy/assets/icons/vertex.svg";

const VENDOR_ICONS: Record<string, { light: string; dark: string }> = {
  amp: { light: iconAmp, dark: iconAmp },
  antigravity: { light: iconAntigravity, dark: iconAntigravity },
  claude: { light: iconClaude, dark: iconClaude },
  codex: { light: iconCodex, dark: iconCodex },
  deepseek: { light: iconDeepseek, dark: iconDeepseek },
  gemini: { light: iconGemini, dark: iconGemini },
  glm: { light: iconGlm, dark: iconGlm },
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  grok: { light: iconGrok, dark: iconGrok },
  iflow: { light: iconIflow, dark: iconIflow },
  kiro: { light: iconKiro, dark: iconKiro },
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  mimo: { light: iconMimo, dark: iconMimo },
  minimax: { light: iconMinimax, dark: iconMinimax },
  o1: { light: iconOpenaiLight, dark: iconOpenaiDark },
  o3: { light: iconOpenaiLight, dark: iconOpenaiDark },
  o4: { light: iconOpenaiLight, dark: iconOpenaiDark },
  opencode: { light: iconOpencodeLight, dark: iconOpencodeDark },
  openai: { light: iconOpenaiLight, dark: iconOpenaiDark },
  qwen: { light: iconQwen, dark: iconQwen },
  vertex: { light: iconVertex, dark: iconVertex },
};

function getVendorPrefix(modelId: string): string {
  const lower = modelId.toLowerCase();
  for (const prefix of Object.keys(VENDOR_ICONS)) {
    if (lower.startsWith(prefix)) return prefix;
  }
  return "";
}

export function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
  const prefix = getVendorPrefix(modelId);
  const icons = prefix ? VENDOR_ICONS[prefix] : null;
  if (!icons) return null;
  return (
    <>
      <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
      <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
    </>
  );
}
