/**
 * 各家厂商的品牌色，取自 `icons/*.svg` 里 logo 本身的主色（Codex 的蓝紫渐变、Claude 的珊瑚橙、
 * Gemini 的蓝、Kimi 的亮蓝……），会员徽章、供应商标签、按厂商着色的图表都从这里取。
 *
 * - `color`：浅色界面里的主色；`colorDark`：深色界面里亮一档，保证在深底上的对比度；
 * - `accent`：渐变的另一端（高阶 / 旗舰会员、渐变徽章）；
 * - `onColor`：压在实色主色上的文字色。xAI / Grok、Ollama 这类黑白品牌在深色模式下反转。
 */
export interface VendorBrand {
  color: string;
  colorDark: string;
  accent: string;
  accentDark: string;
  onColor: string;
  onColorDark: string;
}

const brand = (
  color: string,
  colorDark: string,
  accent: string,
  accentDark: string,
  onColor = "#ffffff",
  onColorDark = "#ffffff",
): VendorBrand => ({ color, colorDark, accent, accentDark, onColor, onColorDark });

const MONOCHROME = brand("#18181b", "#ededed", "#71717a", "#a1a1aa", "#ffffff", "#111111");

const CODEX = brand("#3941ff", "#8b93ff", "#a78bfa", "#c4b5fd");
const OPENAI = brand("#10a37f", "#3ecf9a", "#34d399", "#6ee7b7");
const CLAUDE = brand("#d97757", "#e8957a", "#f2b596", "#f6c7ad");
const GEMINI = brand("#3186ff", "#6aa7ff", "#9b72cb", "#b596e0");
// Antigravity 的 logo 是红到橙的渐变：主色取橙，红色只做渐变的另一端——
// 主色用红的话，「PRO」实色徽章会被看成错误标签。
const ANTIGRAVITY = brand("#ea7a2c", "#f59a5a", "#e45c49", "#f07d6c");
const VERTEX = brand("#4285f4", "#7baaf7", "#34a853", "#81c995");
const KIMI = brand("#027aff", "#4da3ff", "#38bdf8", "#7dd3fc");
const QWEN = brand("#6336e7", "#9478f5", "#6f69f7", "#a5a1fb");
const IFLOW = brand("#5c5cff", "#8c8cff", "#ae5cff", "#c995ff");
const KIRO = brand("#ff9900", "#ffb13d", "#ffc266", "#ffd28f", "#1f2937", "#1f2937");
const DEEPSEEK = brand("#4d6bfe", "#7d93ff", "#8fa3ff", "#b3c1ff");
const GLM = brand("#3859ff", "#6e86ff", "#8296ff", "#a8b6ff");
const MINIMAX = brand("#e2167e", "#f04b9b", "#fe603c", "#ff8a6e");
const HUNYUAN = brand("#0052d9", "#4c8dff", "#4d8dff", "#80adff");
const AMP = brand("#f34e3f", "#ff7a6e", "#ff9a8f", "#ffb8b0");
const MIMO = brand("#ff6900", "#ff8c3a", "#ffa366", "#ffbe8f");

const VENDOR_BRANDS: Record<string, VendorBrand> = {
  codex: CODEX,
  openai: OPENAI,
  gpt: OPENAI,
  o1: OPENAI,
  o3: OPENAI,
  o4: OPENAI,
  claude: CLAUDE,
  anthropic: CLAUDE,
  gemini: GEMINI,
  "gemini-cli": GEMINI,
  aistudio: GEMINI,
  antigravity: ANTIGRAVITY,
  vertex: VERTEX,
  grok: MONOCHROME,
  xai: MONOCHROME,
  kimi: KIMI,
  moonshot: KIMI,
  qwen: QWEN,
  iflow: IFLOW,
  kiro: KIRO,
  deepseek: DEEPSEEK,
  glm: GLM,
  zhipu: GLM,
  minimax: MINIMAX,
  hunyuan: HUNYUAN,
  hy3: HUNYUAN,
  amp: AMP,
  mimo: MIMO,
  ollama: MONOCHROME,
  opencode: MONOCHROME,
  "opencode-go": MONOCHROME,
  opencode_go: MONOCHROME,
  cline: MONOCHROME,
};

/** 更长 / 更具体的前缀优先，"gemini-cli" 先于 "gemini"、"opencode-go" 先于 "opencode"。 */
const BRAND_PREFIXES = Object.keys(VENDOR_BRANDS).sort((a, b) => b.length - a.length);

/**
 * 按供应商类型或模型 ID 找品牌色（"codex"、"gemini-cli"、"claude-sonnet-4-5"、"gpt-5"……）。
 * 找不到时返回 null，调用方用中性样式。
 */
export function vendorBrand(id: string | null | undefined): VendorBrand | null {
  const lower = String(id ?? "")
    .toLowerCase()
    .trim();
  if (!lower) return null;
  if (VENDOR_BRANDS[lower]) return VENDOR_BRANDS[lower];
  for (const prefix of BRAND_PREFIXES) {
    if (lower.startsWith(prefix)) return VENDOR_BRANDS[prefix]!;
  }
  return null;
}

/**
 * 把品牌色交给 CSS：浅色 / 深色各一组变量，组件里用
 * `[--brand:var(--brand-l)] dark:[--brand:var(--brand-d)]` 选出当前主题的那一组，
 * 不需要在 JS 里判断深浅色。
 */
export function vendorBrandStyle(brandColors: VendorBrand): Record<string, string> {
  return {
    "--brand-l": brandColors.color,
    "--brand-d": brandColors.colorDark,
    "--brand-2-l": brandColors.accent,
    "--brand-2-d": brandColors.accentDark,
    "--brand-on-l": brandColors.onColor,
    "--brand-on-d": brandColors.onColorDark,
  };
}
