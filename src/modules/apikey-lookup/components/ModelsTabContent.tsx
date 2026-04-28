import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Layers, RefreshCw, Search } from "lucide-react";
import { detectApiBaseFromLocation } from "@/lib/connection";
import { CcSwitchImportOptions } from "@/modules/ccswitch/CcSwitchImportOptions";
import {
  buildCcSwitchImportUrl,
  buildCcSwitchProviderName,
  openCcSwitchImportUrl,
  pickCcSwitchDefaultModel,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import { Card } from "@/modules/ui/Card";
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

const DEFAULT_VENDOR_COLOR = {
  bg: "bg-slate-50 dark:bg-neutral-900/40",
  text: "text-slate-600 dark:text-slate-300",
  border: "border-slate-200/60 dark:border-neutral-700/40",
};

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
  return DEFAULT_VENDOR_COLOR;
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

function ModelTag({ id }: { id: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const vc = getVendorColor(id);

  const handleClick = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t("apikey_lookup.copy_model")}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition hover:shadow-sm active:scale-95 ${vc.bg} ${vc.text} ${vc.border}`}
    >
      {copied ? (
        <>
          <Check size={11} className="text-emerald-500" />
          {t("common.copied")}
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

export function ModelsTabContent({
  models,
  loading,
  error,
  searchFilter,
  onSearchChange,
  apiKey,
}: {
  models: string[];
  loading: boolean;
  error: string | null;
  searchFilter: string;
  onSearchChange: (value: string) => void;
  apiKey?: string;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();

  const filteredModels = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((id) => id.toLowerCase().includes(needle));
  }, [models, searchFilter]);

  const vendorStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of models) {
      const lower = id.toLowerCase();
      let vendor = t("common.other");
      for (const prefix of Object.keys(VENDOR_COLORS)) {
        if (lower.startsWith(prefix)) {
          vendor = prefix;
          break;
        }
      }
      map.set(vendor, (map.get(vendor) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [models, t]);

  const handleImportToCcSwitch = (clientType: CcSwitchClientType) => {
    const key = String(apiKey ?? "").trim();
    if (!key) return;

    const url = buildCcSwitchImportUrl({
      apiKey: key,
      baseUrl: detectApiBaseFromLocation(),
      clientType,
      providerName: buildCcSwitchProviderName({ clientType }),
      model: pickCcSwitchDefaultModel(clientType, models),
    });

    openCcSwitchImportUrl(url, {
      onProtocolUnavailable: () =>
        notify({ type: "error", message: t("ccswitch.protocol_unavailable") }),
    });
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <Layers size={15} className="text-slate-500 dark:text-white/40" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("apikey_lookup.available_models")}
          </h3>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
            {filteredModels.length}
          </span>
          {searchFilter && filteredModels.length !== models.length ? (
            <span className="text-[10px] text-slate-400 dark:text-white/30">/ {models.length}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {apiKey ? (
            <CcSwitchImportOptions
              t={t}
              models={models}
              compact
              onSelect={handleImportToCcSwitch}
            />
          ) : null}
          <TextInput
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("models_page.search")}
            className="!w-48"
            startAdornment={<Search size={14} className="text-slate-400 dark:text-white/35" />}
          />
        </div>
      </div>

      {vendorStats.length > 0 && !loading ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-neutral-800/60">
          {vendorStats.map(([vendor, count]) => {
            const vc = VENDOR_COLORS[vendor] ?? DEFAULT_VENDOR_COLOR;
            const iconKey = `${vendor}-placeholder`;
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
      ) : null}

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="max-h-[480px] overflow-y-auto px-5 py-4">
        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-white/50">
            <RefreshCw size={14} className="mr-2 animate-spin" />
            {t("models_page.loading")}
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
              {models.length === 0 ? t("common.no_model_data") : t("models_page.no_results")}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
