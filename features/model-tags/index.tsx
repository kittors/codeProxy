import { useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { brandVars, cn } from "@code-proxy/ui";

export type ModelVendorKey =
  | "amp"
  | "antigravity"
  | "claude"
  | "cline"
  | "codex"
  | "deepseek"
  | "gemini"
  | "glm"
  | "gpt"
  | "grok"
  | "hunyuan"
  | "iflow"
  | "kiro"
  | "kimi"
  | "llama"
  | "mimo"
  | "minimax"
  | "mistral"
  | "opencode"
  | "openai"
  | "qwen"
  | "vertex"
  | "other";

type ModelVendorDefinition = {
  key: ModelVendorKey;
  label: string;
  matches: (modelId: string) => boolean;
};

const MODEL_VENDOR_DEFINITIONS: ModelVendorDefinition[] = [
  {
    key: "claude",
    label: "claude",
    matches: (modelId) => startsWithAny(modelId, ["claude", "anthropic"]),
  },
  {
    key: "cline",
    label: "cline",
    matches: (modelId) => startsWithAny(modelId, ["cline", "cline-pass"]),
  },
  {
    key: "gpt",
    label: "gpt",
    matches: (modelId) =>
      startsWithAny(modelId, ["gpt", "chatgpt", "o1", "o3", "o4", "o5"]),
  },
  {
    key: "codex",
    label: "codex",
    matches: (modelId) => startsWithAny(modelId, ["codex"]),
  },
  {
    key: "openai",
    label: "openai",
    matches: (modelId) => startsWithAny(modelId, ["openai"]),
  },
  {
    key: "deepseek",
    label: "deepseek",
    matches: (modelId) => modelId.includes("deepseek"),
  },
  {
    key: "gemini",
    label: "gemini",
    matches: (modelId) => startsWithAny(modelId, ["gemini", "google"]),
  },
  {
    key: "qwen",
    label: "qwen",
    matches: (modelId) => startsWithAny(modelId, ["qwen"]) || modelId.includes("/qwen"),
  },
  {
    key: "kimi",
    label: "kimi",
    matches: (modelId) =>
      startsWithAny(modelId, ["kimi", "moonshot"]) || modelId.includes("/kimi"),
  },
  {
    key: "llama",
    label: "llama",
    matches: (modelId) =>
      startsWithAny(modelId, ["llama", "meta"]) || modelId.includes("/llama"),
  },
  {
    key: "mistral",
    label: "mistral",
    matches: (modelId) => startsWithAny(modelId, ["mistral", "mixtral"]),
  },
  {
    key: "glm",
    label: "glm",
    matches: (modelId) => startsWithAny(modelId, ["glm", "zhipu"]),
  },
  {
    key: "minimax",
    label: "minimax",
    matches: (modelId) => startsWithAny(modelId, ["minimax"]),
  },
  {
    key: "grok",
    label: "grok",
    matches: (modelId) => startsWithAny(modelId, ["grok", "xai"]),
  },
  {
    key: "hunyuan",
    label: "hunyuan",
    // Tencent Hunyuan: hunyuan-*, hy3-preview, tencent/hunyuan-*, etc.
    matches: (modelId) =>
      startsWithAny(modelId, ["hunyuan", "hy3", "tencent-hunyuan"]) ||
      modelId.includes("/hunyuan") ||
      modelId.includes("/hy3") ||
      /^hy\d/.test(modelId),
  },
  {
    key: "kiro",
    label: "kiro",
    matches: (modelId) => startsWithAny(modelId, ["kiro"]),
  },
  {
    key: "mimo",
    label: "mimo",
    matches: (modelId) => startsWithAny(modelId, ["mimo"]),
  },
  {
    key: "vertex",
    label: "vertex",
    matches: (modelId) => startsWithAny(modelId, ["vertex"]),
  },
  {
    key: "iflow",
    label: "iflow",
    matches: (modelId) => startsWithAny(modelId, ["iflow"]),
  },
  {
    key: "amp",
    label: "amp",
    matches: (modelId) => startsWithAny(modelId, ["amp"]),
  },
  {
    key: "antigravity",
    label: "antigravity",
    matches: (modelId) => startsWithAny(modelId, ["antigravity"]),
  },
  {
    key: "opencode",
    label: "opencode",
    matches: (modelId) => startsWithAny(modelId, ["opencode"]),
  },
];

const MODEL_TAG_SIZE_CLASSES = {
  xs: {
    wrapper: "gap-1 rounded-md px-1.5 py-0.5 text-2xs",
    icon: 11,
  },
  sm: {
    wrapper: "gap-1.5 rounded-md px-2 py-0.5 text-xs",
    icon: 12,
  },
  md: {
    wrapper: "gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
    icon: 14,
  },
} as const;

export type ModelTagSize = keyof typeof MODEL_TAG_SIZE_CLASSES;

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function getModelVendorKey(modelId: string): ModelVendorKey {
  const normalized = String(modelId || "").trim().toLowerCase();
  const definition = MODEL_VENDOR_DEFINITIONS.find((item) => item.matches(normalized));
  return definition?.key ?? "other";
}

export function getModelVendorLabel(modelId: string, otherLabel = "Other"): string {
  const key = getModelVendorKey(modelId);
  if (key === "other") return otherLabel;
  return MODEL_VENDOR_DEFINITIONS.find((item) => item.key === key)?.label ?? key;
}

const MODEL_VENDOR_KEYS = new Set<string>([
  ...MODEL_VENDOR_DEFINITIONS.map((definition) => definition.key),
  "other",
]);

/**
 * 模型 / 厂商标签的品牌淡底：一成左右的品牌底、品牌色的字、再淡一档的品牌描边，和 ProviderTag
 * 同一套配方，模型标签与供应商标签放在一起时颜色对得上。认不出的厂商 brandVars 回落到墨色，
 * 于是就是中性的浅灰底、黑字。
 */
const BRAND_TINT_CLASS = [
  "border-[color-mix(in_oklab,var(--brand)_22%,transparent)] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-[var(--brand-text)]",
  "dark:border-[color-mix(in_oklab,var(--brand)_30%,transparent)] dark:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)]",
].join(" ");

export type ModelVendorBrand = { className: string; style: CSSProperties };

/**
 * 模型或厂商 key 的品牌外观（类名 + 品牌 CSS 变量，两者要一起挂到同一个元素上）。
 *
 * 先用 getModelVendorKey 认厂商：它认得的写法比品牌表全（"chatgpt-4o"、"tencent/hunyuan-large"、
 * "cline-pass/…" 都算），再从 vendorBrand() 取颜色；它认不出的，拿原始 ID 再按品牌前缀表试一次，
 * 仍认不出就回落中性。颜色只从品牌表来，这里不再手写色板。
 */
export function modelVendorBrand(modelIdOrVendorKey: string): ModelVendorBrand {
  const key = MODEL_VENDOR_KEYS.has(modelIdOrVendorKey)
    ? (modelIdOrVendorKey as ModelVendorKey)
    : getModelVendorKey(modelIdOrVendorKey);
  const vars = brandVars(key === "other" ? modelIdOrVendorKey : key);
  return { className: cn(vars.className, BRAND_TINT_CLASS), style: vars.style };
}

export function buildModelVendorStats(models: string[], otherLabel = "Other") {
  const stats = new Map<ModelVendorKey, { key: ModelVendorKey; label: string; count: number }>();

  for (const model of models) {
    const key = getModelVendorKey(model);
    const current = stats.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    stats.set(key, {
      key,
      label: key === "other" ? otherLabel : getModelVendorLabel(model, otherLabel),
      count: 1,
    });
  }

  return Array.from(stats.values()).sort((left, right) => right.count - left.count);
}

/**
 * logo 也按认出的厂商取：VendorIcon 只认前缀，"chatgpt-4o"、"tencent/hunyuan-large"、
 * "google/…" 这类写法它找不到 logo，先归到厂商再取，图标和颜色就始终是同一家。
 */
function vendorIconId(modelIdOrOwner: string): string {
  const key = getModelVendorKey(modelIdOrOwner);
  return key === "other" ? modelIdOrOwner : key;
}

function ModelTagContent({ id, iconSize }: { id: string; iconSize: number }) {
  return (
    <>
      <VendorIcon modelId={vendorIconId(id)} size={iconSize} />
      <span className="min-w-0 truncate">{id}</span>
    </>
  );
}

/**
 * 厂商图标块（模型卡片左上角、归属列表）：品牌淡底 + 品牌描边 + logo。没有 logo 的露出首字母
 * （peer-empty：logo 那一格渲染为空时才显示），认不出品牌的回落中性浅灰。
 */
export function ModelVendorTile({
  modelId,
  compact = false,
}: {
  /** 模型 ID 或归属方（openai、anthropic、google……）。 */
  modelId: string;
  /** 列表里用的小号块。 */
  compact?: boolean;
}) {
  const brand = modelVendorBrand(modelId);
  return (
    <div
      style={brand.style}
      className={cn(
        brand.className,
        "relative flex shrink-0 items-center justify-center border",
        compact ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl",
      )}
    >
      <span className="peer flex items-center justify-center empty:hidden">
        <VendorIcon modelId={vendorIconId(modelId)} size={compact ? 16 : 22} />
      </span>
      <span className="hidden text-sm font-bold opacity-60 peer-empty:inline" aria-hidden="true">
        {modelId.trim().charAt(0).toUpperCase() || "M"}
      </span>
    </div>
  );
}

/**
 * 归属标签（owned_by：openai、anthropic、google……）：按归属方自己的品牌上淡底，认不出的
 * 归属方保持中性——颜色只回答「这是谁家的」，不替未知归属方编一个颜色。
 */
export function ModelOwnerTag({
  owner,
  withLogo = false,
  className,
}: {
  owner: string;
  withLogo?: boolean;
  className?: string;
}) {
  const brand = modelVendorBrand(owner);
  return (
    <span
      style={brand.style}
      className={cn(
        brand.className,
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-px text-2xs font-medium",
        className,
      )}
    >
      {withLogo ? <VendorIcon modelId={vendorIconId(owner)} size={11} /> : null}
      <span className="min-w-0 truncate">{owner}</span>
    </span>
  );
}

export function ModelTag({
  id,
  size = "md",
  className,
  title,
}: {
  id: string;
  size?: ModelTagSize;
  className?: string;
  title?: string;
}) {
  const brand = modelVendorBrand(id);
  const sizeClasses = MODEL_TAG_SIZE_CLASSES[size];

  return (
    <span
      // No implicit title: it repeated the visible model id as a second, native
      // tooltip stacked on top of the managed one. Callers that truncate the tag
      // wrap it in OverflowTooltip, which only opens when the text is cut off.
      title={title}
      style={brand.style}
      className={cn(
        "inline-flex max-w-full items-center border font-mono font-semibold leading-none",
        sizeClasses.wrapper,
        brand.className,
        className,
      )}
    >
      <ModelTagContent id={id} iconSize={sizeClasses.icon} />
    </span>
  );
}

export function CopyableModelTag({
  id,
  copiedLabel,
  title,
  onCopied,
  className,
}: {
  id: string;
  copiedLabel: string;
  title: string;
  onCopied?: (id: string) => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const brand = modelVendorBrand(id);

  const handleClick = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    onCopied?.(id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      style={brand.style}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold leading-none transition hover:shadow-sm active:scale-95",
        brand.className,
        className,
      )}
    >
      {copied ? (
        <>
          <Check size={11} className="text-emerald-500" />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <ModelTagContent id={id} iconSize={14} />
      )}
    </button>
  );
}

export function ModelVendorStatBadge({
  vendorKey,
  label,
  count,
  active = false,
  onClick,
}: {
  vendorKey: ModelVendorKey;
  label: string;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const brand = modelVendorBrand(vendorKey);
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-semibold",
    brand.className,
    // 选中圈也用品牌色，和淡底同一家族，不再是一圈灰。
    active
      ? "ring-2 ring-[color-mix(in_oklab,var(--brand)_45%,transparent)] ring-offset-1 ring-offset-white dark:ring-offset-neutral-950"
      : "",
    onClick ? "cursor-pointer transition hover:shadow-sm" : "",
  );
  const content = (
    <>
      <VendorIcon modelId={vendorKey} size={12} />
      {label}
      <span className="tabular-nums">{count}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={`${label} ${count}`}
        aria-pressed={active}
        onClick={onClick}
        style={brand.style}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <span style={brand.style} className={className}>
      {content}
    </span>
  );
}
