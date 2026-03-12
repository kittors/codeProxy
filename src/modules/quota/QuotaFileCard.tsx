import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldAlert } from "lucide-react";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import type { QuotaState } from "@/modules/quota/quota-helpers";
import {
  clampPercent,
  isDisabledAuthFile,
  resolveAuthProvider,
} from "@/modules/quota/quota-helpers";

// Vendor SVG icons
import iconClaude from "@/assets/icons/claude.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconAntigravity from "@/assets/icons/antigravity.svg";
import iconOpenai from "@/assets/icons/openai.svg";

/* ── Model label → icon lookup ── */
const MODEL_ICONS: Record<string, { light: string; dark: string }> = {
  claude: { light: iconClaude, dark: iconClaude },
  gpt: { light: iconOpenai, dark: iconOpenai },
  gemini: { light: iconGemini, dark: iconGemini },
  codex: { light: iconCodex, dark: iconCodex },
  kiro: { light: iconKiro, dark: iconKiro },
};

function ModelIcon({ label, size = 13 }: { label: string; size?: number }) {
  const lower = label.toLowerCase();
  for (const [prefix, icons] of Object.entries(MODEL_ICONS)) {
    if (lower.includes(prefix)) {
      return (
        <>
          <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
          <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
        </>
      );
    }
  }
  return null;
}

/* ── Progress bar ── */
function QuotaBar({ percent }: { percent: number | null }) {
  const normalized = percent === null ? null : clampPercent(percent);
  const width = normalized ?? 0;
  const color =
    normalized === null
      ? "bg-slate-300/40 dark:bg-white/8"
      : normalized >= 60
        ? "bg-emerald-500"
        : normalized >= 20
          ? "bg-amber-500"
          : "bg-rose-500";

  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-neutral-800/80">
      <div
        className={`h-full rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/* ── Provider icon map for card header ── */
const PROVIDER_ICON: Record<string, { light: string; dark: string }> = {
  antigravity: { light: iconAntigravity, dark: iconAntigravity },
  codex: { light: iconCodex, dark: iconCodex },
  "gemini-cli": { light: iconGemini, dark: iconGemini },
  kiro: { light: iconKiro, dark: iconKiro },
};

export function QuotaFileCard({
  file,
  state,
  onRefresh,
}: {
  file: AuthFileItem;
  state: QuotaState;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const provider = resolveAuthProvider(file);
  const disabled = isDisabledAuthFile(file);
  const providerIcon = PROVIDER_ICON[provider];

  /* Translate i18n-key labels returned by quota-helpers */
  const tl = (text: string) =>
    text.startsWith("m_quota.") ? t(text) : text;

  /* Translate resetLabel with embedded params (e.g. 'm_quota.minutes_later::5') */
  const trl = (text: string) => {
    if (!text.startsWith("m_quota.")) return text;
    const parts = text.split("::");
    const key = parts[0];
    if (key === "m_quota.minutes_later") return t(key, { minutes: parts[1] });
    if (key === "m_quota.hours_later") return t(key, { hours: parts[1] });
    if (key === "m_quota.hours_minutes_later") return t(key, { hours: parts[1], minutes: parts[2] });
    return t(key);
  };

  /* Translate error messages that may be i18n keys */
  const te = (text: string) =>
    text.startsWith("m_quota.") || text === "missing_auth_index" || text === "no_model_quota" || text === "request_failed" || text === "missing_account_id" || text === "parse_codex_failed" || text === "missing_project_id" || text === "parse_kiro_failed"
      ? t(`m_quota.${text.replace("m_quota.", "")}`) : text;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60">
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5">
        {providerIcon && (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 dark:bg-neutral-800/60">
            <img src={providerIcon.light} alt="" width={14} height={14} className="dark:hidden" />
            <img src={providerIcon.dark} alt="" width={14} height={14} className="hidden dark:block" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-800 dark:text-white">
            {file.name}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-white/40">
            {disabled ? t("m_quota.disabled") : t("m_quota.enabled")}
            {state.updatedAt
              ? ` · ${new Date(state.updatedAt).toLocaleTimeString()}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={state.status === "loading"}
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <RefreshCw
            size={12}
            className={state.status === "loading" ? "animate-spin" : ""}
          />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="mt-2.5">
        {state.status === "error" ? (
          <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
            <ShieldAlert size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{te(state.error || "m_quota.load_failed")}</span>
          </div>
        ) : state.items.length === 0 ? (
          <p className="py-1 text-center text-[11px] text-slate-400 dark:text-white/35">
            {state.status === "loading" ? t("m_quota.loading_quota") : t("m_quota.click_to_refresh")}
          </p>
        ) : (
          <div className="space-y-2">
            {state.items.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ModelIcon label={tl(item.label)} size={12} />
                    <span className="truncate text-[11px] font-medium text-slate-700 dark:text-white/80">
                      {tl(item.label)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] tabular-nums">
                    <span className="font-semibold text-slate-800 dark:text-white">
                      {item.percent === null
                        ? "--"
                        : `${Math.round(clampPercent(item.percent))}%`}
                    </span>
                    {item.resetLabel && item.resetLabel !== "--" && (
                      <span className="hidden text-slate-400 dark:text-white/30 sm:inline">
                        {trl(item.resetLabel)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-1">
                  <QuotaBar percent={item.percent} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
