/**
 * 各家厂商的品牌色，取自 `icons/*.svg` 里 logo 本身的主色（Codex 的蓝紫渐变、Claude 的珊瑚橙、
 * Gemini 的蓝、Kimi 的亮蓝……），会员徽章、供应商标签、按厂商着色的图表都从这里取。
 *
 * - `color` / `colorDark`：品牌主色（浅色界面 / 深色界面里亮一档），用于文字、细节和淡底的色源；
 * - `accent` / `accentDark`：品牌的第二种颜色（渐变的另一端、图表里的次序列）；
 * - `fill` / `fillAccent`：实色与渐变徽章的底色。logo 原色多数偏亮，白字压上去只有 2–3.5:1，
 *   10px 的徽章文字读不清；这一组是同色相压暗到「白字 ≥ 4.5:1」的版本，浅色、深色界面共用。
 *   黑白品牌（xAI / Grok、Ollama……）在深色界面反转成浅底黑字（`fillDark` / `onFillDark`）；
 * - `text` / `textDark`：品牌淡底上的品牌色文字（供应商标签、入门档徽章、模型标签……）。淡底比白底
 *   暗一些，直接拿 logo 色或 `fill` 当字，多数品牌只有 3–4:1，Kiro 的亮橙在白底上不到 2:1；这一组是
 *   OKLCH 里色相不变、只调亮度（浅色压暗、深色提亮）到「最深一档淡底上也 ≥ 4.5:1」的版本，
 *   本来就达标的保持原色。每个品牌都由 `__tests__/vendorBrands.test.ts` 逐一校验；
 * - `onFill`：实色块上的文字色，除 Kiro（AWS 橙配深字）外都是白色。
 */
export interface VendorBrand {
  color: string;
  colorDark: string;
  accent: string;
  accentDark: string;
  text: string;
  textDark: string;
  fill: string;
  fillAccent: string;
  fillDark: string;
  fillAccentDark: string;
  onFill: string;
  onFillDark: string;
}

const brand = (
  [color, colorDark]: [string, string],
  [accent, accentDark]: [string, string],
  [fill, fillAccent]: [string, string],
  [text, textDark]: [string, string],
  dark?: { fill: string; fillAccent: string; onFill?: string },
  onFill = "#ffffff",
): VendorBrand => ({
  color,
  colorDark,
  accent,
  accentDark,
  text,
  textDark,
  fill,
  fillAccent,
  fillDark: dark?.fill ?? fill,
  fillAccentDark: dark?.fillAccent ?? fillAccent,
  onFill,
  onFillDark: dark?.onFill ?? onFill,
});

const MONOCHROME = brand(
  ["#18181b", "#ededed"],
  ["#71717a", "#a1a1aa"],
  ["#18181b", "#52525b"],
  ["#18181b", "#ededed"],
  {
    fill: "#ededed",
    fillAccent: "#a1a1aa",
    onFill: "#111111",
  },
);

const CODEX = brand(
  ["#3941ff", "#8b93ff"],
  ["#a78bfa", "#c4b5fd"],
  ["#3941ff", "#7e55f8"],
  ["#3941ff", "#a9b2ff"],
);
const OPENAI = brand(
  ["#10a37f", "#3ecf9a"],
  ["#34d399", "#6ee7b7"],
  ["#0d8266", "#0e7490"],
  ["#00775d", "#4ad8a3"],
);
const CLAUDE = brand(
  ["#d97757", "#e8957a"],
  ["#f2b596", "#f6c7ad"],
  ["#c2512c", "#b45309"],
  ["#b64620", "#fca78c"],
);
const GEMINI = brand(
  ["#3186ff", "#6aa7ff"],
  ["#9b72cb", "#b596e0"],
  ["#036bff", "#8b5cc3"],
  ["#005fe7", "#8fbdff"],
);
// Antigravity 的 logo 是红到橙的渐变：主色取橙，红色只做渐变的另一端——
// 主色用红的话，「PRO」实色徽章会被看成错误标签。
const ANTIGRAVITY = brand(
  ["#ea7a2c", "#f59a5a"],
  ["#e45c49", "#f07d6c"],
  ["#bc5813", "#da3720"],
  ["#ae4d00", "#ffab71"],
);
const VERTEX = brand(
  ["#4285f4", "#7baaf7"],
  ["#34a853", "#81c995"],
  ["#1b6cf2", "#298542"],
  ["#0960e5", "#96beff"],
);
const KIMI = brand(
  ["#027aff", "#4da3ff"],
  ["#38bdf8", "#7dd3fc"],
  ["#0070ed", "#067baf"],
  ["#0062d2", "#82bdff"],
);
const QWEN = brand(
  ["#6336e7", "#9478f5"],
  ["#6f69f7", "#a5a1fb"],
  ["#6336e7", "#665ff6"],
  ["#6336e7", "#b5a6ff"],
);
const IFLOW = brand(
  ["#5c5cff", "#8c8cff"],
  ["#ae5cff", "#c995ff"],
  ["#5c5cff", "#9c38ff"],
  ["#524df0", "#acb0ff"],
);
const KIRO = brand(
  ["#ff9900", "#ffb13d"],
  ["#ffc266", "#ffd28f"],
  ["#ff9900", "#ffc266"],
  ["#9e5d00", "#ffb64e"],
  undefined,
  "#1f2937",
);
const DEEPSEEK = brand(
  ["#4d6bfe", "#7d93ff"],
  ["#8fa3ff", "#b3c1ff"],
  ["#4363fe", "#1e40af"],
  ["#3955ef", "#a1b4ff"],
);
const GLM = brand(
  ["#3859ff", "#6e86ff"],
  ["#8296ff", "#a8b6ff"],
  ["#3859ff", "#4338ca"],
  ["#3350f6", "#9bb0ff"],
);
const MINIMAX = brand(
  ["#e2167e", "#f04b9b"],
  ["#fe603c", "#ff8a6e"],
  ["#dd167b", "#dd2a01"],
  ["#c3006a", "#ff8ebd"],
);
const HUNYUAN = brand(
  ["#0052d9", "#4c8dff"],
  ["#4d8dff", "#80adff"],
  ["#0052d9", "#1569ff"],
  ["#0052d9", "#89b5ff"],
);
const AMP = brand(
  ["#f34e3f", "#ff7a6e"],
  ["#ff9a8f", "#ffb8b0"],
  ["#e2200e", "#be123c"],
  ["#cf1000", "#ffa196"],
);
const MIMO = brand(
  ["#ff6900", "#ff8c3a"],
  ["#ffa366", "#ffbe8f"],
  ["#c25000", "#c2410c"],
  ["#b24900", "#ffa872"],
);
// 下面三家没有 logo 资源，只用品牌色（模型归属标签里常见）。
const MISTRAL = brand(
  ["#fa520f", "#fb7d4b"],
  ["#ffaf00", "#ffbc29"],
  ["#d23f04", "#996900"],
  ["#be3700", "#ffa27f"],
);
const META = brand(
  ["#0866ff", "#458cff"],
  ["#00c6ff", "#29cfff"],
  ["#0866ff", "#007fa3"],
  ["#005ae8", "#86b4ff"],
);
const ALIBABA = brand(
  ["#ff6a00", "#ff8e3d"],
  ["#ff9a3d", "#ffaf66"],
  ["#c25100", "#b75800"],
  ["#b14900", "#ffa973"],
);

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
  mistral: MISTRAL,
  codestral: MISTRAL,
  meta: META,
  llama: META,
  alibaba: ALIBABA,
  ollama: MONOCHROME,
  opencode: MONOCHROME,
  "opencode-go": MONOCHROME,
  opencode_go: MONOCHROME,
  cline: MONOCHROME,
};

/** 更长 / 更具体的前缀优先，"gemini-cli" 先于 "gemini"、"opencode-go" 先于 "opencode"。 */
const BRAND_PREFIXES = Object.keys(VENDOR_BRANDS).sort((a, b) => b.length - a.length);

/**
 * 登记过的每一套品牌色及其全部别名（["claude", "anthropic"] → CLAUDE）。给对比度校验遍历用，
 * 新加的品牌不用另外登记就会被校验到。
 */
export function registeredVendorBrands(): Array<{ ids: string[]; brand: VendorBrand }> {
  const groups = new Map<VendorBrand, string[]>();
  for (const [id, brand] of Object.entries(VENDOR_BRANDS)) {
    groups.set(brand, [...(groups.get(brand) ?? []), id]);
  }
  return Array.from(groups, ([brand, ids]) => ({ ids, brand }));
}

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
    "--brand-text-l": brandColors.text,
    "--brand-text-d": brandColors.textDark,
    "--brand-fill-l": brandColors.fill,
    "--brand-fill-d": brandColors.fillDark,
    "--brand-fill-2-l": brandColors.fillAccent,
    "--brand-fill-2-d": brandColors.fillAccentDark,
    "--brand-on-l": brandColors.onFill,
    "--brand-on-d": brandColors.onFillDark,
  };
}
