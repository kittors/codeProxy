import { useState } from "react";
import { Check } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { cn } from "@code-proxy/ui";

export type ModelVendorKey =
  | "amp"
  | "antigravity"
  | "claude"
  | "codex"
  | "deepseek"
  | "gemini"
  | "glm"
  | "gpt"
  | "grok"
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

export type ModelVendorTone = {
  bg: string;
  text: string;
  border: string;
};

type ModelVendorDefinition = {
  key: ModelVendorKey;
  label: string;
  matches: (modelId: string) => boolean;
};

export const MODEL_VENDOR_COLORS: Record<ModelVendorKey, ModelVendorTone> = {
  claude: {
    bg: "bg-orange-50 dark:bg-orange-950/20",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200/60 dark:border-orange-800/30",
  },
  gpt: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  codex: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  openai: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  deepseek: {
    bg: "bg-cyan-50 dark:bg-cyan-950/20",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200/60 dark:border-cyan-800/30",
  },
  gemini: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200/60 dark:border-blue-800/30",
  },
  qwen: {
    bg: "bg-violet-50 dark:bg-violet-950/20",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200/60 dark:border-violet-800/30",
  },
  llama: {
    bg: "bg-indigo-50 dark:bg-indigo-950/20",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200/60 dark:border-indigo-800/30",
  },
  mistral: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/60 dark:border-amber-800/30",
  },
  minimax: {
    bg: "bg-sky-50 dark:bg-sky-950/20",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200/60 dark:border-sky-800/30",
  },
  glm: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200/60 dark:border-blue-800/30",
  },
  grok: {
    bg: "bg-slate-50 dark:bg-slate-900/30",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200/60 dark:border-slate-700/30",
  },
  kimi: {
    bg: "bg-slate-50 dark:bg-slate-900/30",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200/60 dark:border-slate-700/30",
  },
  kiro: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/60 dark:border-amber-800/30",
  },
  mimo: {
    bg: "bg-purple-50 dark:bg-purple-950/20",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200/60 dark:border-purple-800/30",
  },
  vertex: {
    bg: "bg-fuchsia-50 dark:bg-fuchsia-950/20",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    border: "border-fuchsia-200/60 dark:border-fuchsia-800/30",
  },
  iflow: {
    bg: "bg-teal-50 dark:bg-teal-950/20",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-200/60 dark:border-teal-800/30",
  },
  amp: {
    bg: "bg-rose-50 dark:bg-rose-950/20",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200/60 dark:border-rose-800/30",
  },
  antigravity: {
    bg: "bg-lime-50 dark:bg-lime-950/20",
    text: "text-lime-700 dark:text-lime-300",
    border: "border-lime-200/60 dark:border-lime-800/30",
  },
  opencode: {
    bg: "bg-zinc-50 dark:bg-zinc-900/40",
    text: "text-zinc-700 dark:text-zinc-300",
    border: "border-zinc-200/60 dark:border-zinc-700/40",
  },
  other: {
    bg: "bg-slate-50 dark:bg-neutral-900/40",
    text: "text-slate-600 dark:text-slate-300",
    border: "border-slate-200/60 dark:border-neutral-700/40",
  },
};

const MODEL_VENDOR_DEFINITIONS: ModelVendorDefinition[] = [
  {
    key: "claude",
    label: "claude",
    matches: (modelId) => startsWithAny(modelId, ["claude", "anthropic"]),
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
    wrapper: "gap-1 rounded-md px-1.5 py-0.5 text-[10px]",
    icon: 11,
  },
  sm: {
    wrapper: "gap-1.5 rounded-md px-2 py-0.5 text-[11px]",
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

export function getModelVendorColor(modelIdOrVendorKey: string): ModelVendorTone {
  const key =
    modelIdOrVendorKey in MODEL_VENDOR_COLORS
      ? (modelIdOrVendorKey as ModelVendorKey)
      : getModelVendorKey(modelIdOrVendorKey);
  return MODEL_VENDOR_COLORS[key] ?? MODEL_VENDOR_COLORS.other;
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

function ModelTagContent({ id, iconSize }: { id: string; iconSize: number }) {
  return (
    <>
      <VendorIcon modelId={id} size={iconSize} />
      <span className="min-w-0 truncate">{id}</span>
    </>
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
  const tone = getModelVendorColor(id);
  const sizeClasses = MODEL_TAG_SIZE_CLASSES[size];

  return (
    <span
      title={title ?? id}
      className={cn(
        "inline-flex max-w-full items-center border font-mono font-semibold leading-none",
        sizeClasses.wrapper,
        tone.bg,
        tone.text,
        tone.border,
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
  const tone = getModelVendorColor(id);

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
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold leading-none transition hover:shadow-sm active:scale-95",
        tone.bg,
        tone.text,
        tone.border,
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
}: {
  vendorKey: ModelVendorKey;
  label: string;
  count: number;
}) {
  const tone = getModelVendorColor(vendorKey);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
        tone.bg,
        tone.text,
        tone.border,
      )}
    >
      <VendorIcon modelId={vendorKey} size={12} />
      {label}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
