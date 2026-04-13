import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  GitBranch,
  CalendarClock,
  MonitorSmartphone,
  KeyRound,
  RefreshCw,
  Search,
  Server,
  Layers,
} from "lucide-react";
import { apiClient } from "@/lib/http/client";
import { useAuth } from "@/modules/auth/AuthProvider";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { useToast } from "@/modules/ui/ToastProvider";

// Vendor SVG icons
import iconClaude from "@/assets/icons/claude.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconDeepseek from "@/assets/icons/deepseek.svg";
import iconQwen from "@/assets/icons/qwen.svg";
import iconMinimax from "@/assets/icons/minimax.svg";
import iconGrok from "@/assets/icons/grok.svg";
import iconKimiLight from "@/assets/icons/kimi-light.svg";
import iconKimiDark from "@/assets/icons/kimi-dark.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGlm from "@/assets/icons/glm.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconIflow from "@/assets/icons/iflow.svg";

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

type V1ModelsResponse =
  | { data?: Array<{ id?: string }> }
  | { models?: Array<{ id?: string }> }
  | Array<{ id?: string }>
  | Record<string, unknown>;

const extractModelIds = (payload: V1ModelsResponse): string[] => {
  const data = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as Array<{ id?: string }>)
      : Array.isArray((payload as { models?: unknown }).models)
        ? ((payload as { models: unknown[] }).models as Array<{ id?: string }>)
        : [];
  return Array.from(
    new Set(
      data
        .map((i) => (i && typeof i === "object" ? String((i as { id?: unknown }).id) : ""))
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
};

/** Vendor prefix → color scheme */
const VENDOR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
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
  o1: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  o3: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  o4: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  gemini: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200/60 dark:border-blue-800/30",
  },
  deepseek: {
    bg: "bg-cyan-50 dark:bg-cyan-950/20",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200/60 dark:border-cyan-800/30",
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
  codex: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/60 dark:border-emerald-800/30",
  },
  glm: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200/60 dark:border-blue-800/30",
  },
  kiro: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/60 dark:border-amber-800/30",
  },
};

const DEFAULT_VENDOR = {
  bg: "bg-slate-50 dark:bg-neutral-900/40",
  text: "text-slate-600 dark:text-slate-300",
  border: "border-slate-200/60 dark:border-neutral-700/40",
};

/** Vendor prefix → icon (light, dark) */
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

function getVendorColor(modelId: string) {
  const lower = modelId.toLowerCase();
  for (const [prefix, color] of Object.entries(VENDOR_COLORS)) {
    if (lower.startsWith(prefix)) return color;
  }
  return DEFAULT_VENDOR;
}

function getVendorPrefix(modelId: string): string {
  const lower = modelId.toLowerCase();
  for (const prefix of Object.keys(VENDOR_ICONS)) {
    if (lower.startsWith(prefix)) return prefix;
  }
  return "";
}

function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
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

/* ═══════════════════════════════════════════════════════════
   InfoCard — compact grid card with icon
   ═══════════════════════════════════════════════════════════ */

function InfoCard({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
  link = false,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  link?: boolean;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify({ type: "success", message: t("system_page.copied"), duration: 1200 });
  };

  const hasCopy = copyable && value && value !== "--";
  const hasExternal = link && value && value !== "--";

  return (
    <div
      className={[
        "group relative min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60 sm:px-4 sm:py-3",
        hasCopy || hasExternal ? "pr-11" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-slate-400 opacity-100 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-neutral-800 dark:hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          title={t("system_page.copy")}
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
      ) : null}

      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} className="hidden text-slate-400 dark:text-white/35 sm:block" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/35">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className={`min-w-0 truncate text-sm font-medium text-indigo-600 underline decoration-indigo-300/40 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400 dark:decoration-indigo-500/30 ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </a>
        ) : (
          <span
            className={`truncate text-sm font-medium text-slate-800 dark:text-white ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </span>
        )}
        {link ? (
          <ExternalLink size={11} className="hidden shrink-0 text-indigo-400/50 sm:inline" />
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ModelTag — tag-style model badge
   ═══════════════════════════════════════════════════════════ */

function ModelTag({ id }: { id: string }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);
  const vc = getVendorColor(id);

  const handleClick = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify({ type: "success", message: t("system_page.copied"), duration: 1200 });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t("system_page.click_copy")}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition hover:shadow-sm active:scale-95 ${vc.bg} ${vc.text} ${vc.border}`}
    >
      {copied ? (
        <>
          <Check size={11} className="text-emerald-500" />
          {t("system_page.copied")}
        </>
      ) : (
        <>
          <VendorIcon modelId={id} size={14} />
          {id}
        </>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */

const _AUTO_REFRESH_INTERVAL = 30_000;

export function SystemPage() {
  const { t } = useTranslation();
  const auth = useAuth();

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("");

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const payload = await apiClient.get<V1ModelsResponse>("/models");
      setModels(extractModelIds(payload));
    } catch (err: unknown) {
      setModelsError(err instanceof Error ? err.message : t("system_page.load_failed"));
    } finally {
      setModelsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const filteredModels = useMemo(() => {
    const needle = modelFilter.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((id) => id.toLowerCase().includes(needle));
  }, [modelFilter, models]);

  // Group models by vendor prefix for stats
  const vendorStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of models) {
      const lower = id.toLowerCase();
      let vendor = "Other";
      for (const prefix of Object.keys(VENDOR_COLORS)) {
        if (lower.startsWith(prefix)) {
          vendor = prefix;
          break;
        }
      }
      map.set(vendor, (map.get(vendor) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [models]);

  const apiKeyLookupUrl = `${window.location.origin}/manage/apikey-lookup`;

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Server size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {t("system_page.title")}
            </h2>
            <p className="hidden text-xs text-slate-500 dark:text-white/45 sm:block">
              {t("system_page.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Connection & Version Grid ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <InfoCard
          icon={Globe}
          label={t("system_page.api_base")}
          value={auth.state.apiBase || "--"}
          mono
          copyable
        />
        <InfoCard
          icon={Globe}
          label={t("system_page.mgmt_endpoint")}
          value={auth.meta.managementEndpoint || "--"}
          mono
          copyable
        />
        <InfoCard
          icon={GitBranch}
          label={t("system_page.version")}
          value={auth.state.serverVersion ?? "--"}
        />
        <InfoCard
          icon={CalendarClock}
          label={t("system_page.build_time")}
          value={auth.state.serverBuildDate ?? "--"}
          mono
        />
        <InfoCard
          icon={MonitorSmartphone}
          label={t("system_page.ui_version")}
          value={__APP_VERSION__ || "--"}
        />
        <InfoCard
          icon={KeyRound}
          label={t("system_page.api_key_lookup")}
          value={apiKeyLookupUrl}
          link
        />
      </div>

      {/* ── Model List ── */}
      <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <Layers size={15} className="text-slate-500 dark:text-white/40" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("system_page.available_models")}
            </h3>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              {filteredModels.length}
            </span>
            {modelFilter && filteredModels.length !== models.length && (
              <span className="text-[10px] text-slate-400 dark:text-white/30">
                / {models.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 pointer-events-none"
              />
              <TextInput
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder={t("system_page.search_models")}
                className="!w-32 sm:!w-48 !rounded-lg !py-1.5 !pl-8 !text-xs"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadModels()}
              disabled={modelsLoading}
            >
              <RefreshCw size={13} className={modelsLoading ? "animate-spin" : ""} />
              {t("system_page.refresh")}
            </Button>
          </div>
        </div>

        {/* Vendor stats bar */}
        {vendorStats.length > 0 && !modelsLoading && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-neutral-800/60">
            {vendorStats.map(([vendor, count]) => {
              const vc = VENDOR_COLORS[vendor] ?? DEFAULT_VENDOR;
              // Use vendor name as a fake model id to get the icon
              const iconKey = vendor + "-placeholder";
              return (
                <span
                  key={vendor}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${vc.bg} ${vc.text} ${vc.border}`}
                >
                  <VendorIcon modelId={iconKey} size={12} />
                  {vendor}
                  <span className="tabular-nums">{count}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Error */}
        {modelsError && (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {modelsError}
          </div>
        )}

        {/* Model tags */}
        <div className="max-h-[480px] overflow-y-auto px-5 py-4">
          {modelsLoading && models.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-white/50">
              <RefreshCw size={14} className="animate-spin mr-2" />
              {t("system_page.loading_models")}
            </div>
          ) : filteredModels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {filteredModels.map((id) => (
                <ModelTag key={id} id={id} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-white/30">
              <Layers size={28} className="mb-2 opacity-40" />
              <p className="text-sm">
                {models.length === 0 ? t("system_page.no_models") : t("system_page.no_match")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
