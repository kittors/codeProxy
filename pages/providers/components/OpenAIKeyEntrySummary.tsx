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
      <p className="text-xs font-semibold text-ink-2">
        {t("providers.api_key_entries")}: {entries.length}
      </p>
      <div className="space-y-1">
        {visible.map((entry, entryIndex) => {
          const entryStats = getKeyEntryStats(entry);
          const entryEnabled = entry.disabled !== true;
          return (
            // 卡片里的一行：无边淡底，不再是卡片里再套一张描边白卡。
            <div
              key={`${entry.apiKey}:${entryIndex}`}
              className="grid gap-2 rounded-inner bg-subtle px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-ink">
                  {entryIndex + 1}. {maskApiKey(entry.apiKey)}
                </p>
                {entry.id ? (
                  <p className="mt-0.5 truncate font-mono text-ink-3" title={entry.id}>
                    ID: {entry.id}
                  </p>
                ) : null}
                {entry.proxyUrl ? (
                  <p className="mt-0.5 truncate font-mono text-ink-3">
                    proxy: {entry.proxyUrl}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 tabular-nums sm:justify-end">
                {/* 简约风格：开着是常态，中性文字即可；停了才用琥珀提醒；成功数中性，失败数大于 0 才标红。
                    多彩风格：「启用」和成功数是绿色胶囊，失败数始终是红色胶囊。 */}
                <span
                  className={
                    entryEnabled
                      ? "px-1 font-medium text-ink-3 colorful:rounded-full colorful:bg-emerald-600/10 colorful:px-2 colorful:py-0.5 colorful:font-semibold colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-200"
                      : "rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300"
                  }
                >
                  {entryEnabled ? t("providers.enabled") : t("providers.disabled")}
                </span>
                <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-600/10 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-200">
                  {t("providers.success_stats", { count: entryStats.success })}
                </span>
                <span
                  className={
                    entryStats.failure > 0
                      ? "rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300"
                      : "rounded-full bg-ink/[0.05] px-2 py-0.5 text-ink-2 dark:bg-white/[0.07] colorful:bg-rose-600/10 colorful:text-rose-700 colorful:dark:bg-rose-500/15 colorful:dark:text-rose-200"
                  }
                >
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
        <p className="text-xs font-medium text-ink-3">
          +{remaining} {t("providers.api_key_entries").toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
