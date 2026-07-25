import { useTranslation } from "react-i18next";
import type { OpenAIProvider } from "@code-proxy/api-client";
import { ToggleSwitch } from "@code-proxy/ui";

interface OpenAIKeyEntrySummaryProps {
  entries: NonNullable<OpenAIProvider["apiKeyEntries"]>;
  maskApiKey: (value: string) => string;
  getKeyEntryStats: (entry: NonNullable<OpenAIProvider["apiKeyEntries"]>[number]) => {
    success: number;
    failure: number;
  };
  maxVisible?: number;
  onToggleKeyEntryEnabled?: (entryIndex: number, enabled: boolean) => void;
}

export function OpenAIKeyEntrySummary({
  entries,
  maskApiKey,
  getKeyEntryStats,
  maxVisible = 2,
  onToggleKeyEntryEnabled,
}: OpenAIKeyEntrySummaryProps) {
  const { t } = useTranslation();
  const visible = entries.slice(0, maxVisible);
  const remaining = entries.length - maxVisible;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
        {t("providers.api_key_entries")}: {entries.length}
      </p>
      <div className="space-y-1">
        {visible.map((entry, entryIndex) => {
          const entryStats = getKeyEntryStats(entry);
          const entryEnabled = entry.disabled !== true;
          return (
            <div
              key={`${entry.apiKey}:${entryIndex}`}
              className="grid gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-slate-900 dark:text-white">
                  {entryIndex + 1}. {maskApiKey(entry.apiKey)}
                </p>
                {entry.id ? (
                  <p className="mt-0.5 truncate font-mono text-slate-500 dark:text-white/50" title={entry.id}>
                    ID: {entry.id}
                  </p>
                ) : null}
                {entry.proxyUrl ? (
                  <p className="mt-0.5 truncate font-mono text-slate-600 dark:text-white/55">
                    proxy: {entry.proxyUrl}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 tabular-nums sm:justify-end">
                <span
                  className={
                    entryEnabled
                      ? "rounded-full bg-emerald-600/10 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                      : "rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-200"
                  }
                >
                  {entryEnabled ? t("providers.enabled") : t("providers.disabled")}
                </span>
                <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {t("providers.success_stats", { count: entryStats.success })}
                </span>
                <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                  {t("providers.failed_stats", { count: entryStats.failure })}
                </span>
                {onToggleKeyEntryEnabled ? (
                  <ToggleSwitch
                    checked={entryEnabled}
                    ariaLabel={`${t("providers.enable_key_entry")} ${entryIndex + 1}`}
                    onCheckedChange={(enabled) => onToggleKeyEntryEnabled(entryIndex, enabled)}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {remaining > 0 ? (
        <p className="text-xs font-medium text-slate-500 dark:text-white/55">
          +{remaining} {t("providers.api_key_entries").toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
