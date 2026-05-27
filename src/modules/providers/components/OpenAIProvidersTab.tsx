import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { OpenAIProvider } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { ProviderCard } from "@/modules/providers/ProviderCard";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";

interface OpenAIProvidersTabProps {
  providers: OpenAIProvider[];
  loading?: boolean;
  openOpenAIEditor: (index: number | null) => void;
  confirmDelete: (index: number) => void;
  maskApiKey: (value: string) => string;
  getKeyEntryStats: (entry: NonNullable<OpenAIProvider["apiKeyEntries"]>[number]) => {
    success: number;
    failure: number;
  };
  getProviderStats: (provider: OpenAIProvider) => { success: number; failure: number };
  getProviderStatusBar: (provider: OpenAIProvider) => {
    blocks: Array<"idle" | "success" | "failure" | "mixed">;
    successRate: number;
    totalSuccess: number;
    totalFailure: number;
  };
  onToggleProviderEnabled?: (providerIndex: number, enabled: boolean) => void;
  onToggleKeyEntryEnabled?: (providerIndex: number, entryIndex: number, enabled: boolean) => void;
  gridColumns?: number;
  selectedKeys?: Set<string>;
  onToggleSelected?: (key: string, checked: boolean) => void;
}

export function OpenAIProvidersTab({
  providers,
  loading = false,
  openOpenAIEditor,
  confirmDelete,
  maskApiKey,
  getKeyEntryStats,
  getProviderStats,
  getProviderStatusBar,
  onToggleProviderEnabled,
  onToggleKeyEntryEnabled,
  gridColumns = 2,
  selectedKeys,
  onToggleSelected,
}: OpenAIProvidersTabProps) {
  const { t } = useTranslation();
  const gridStyle =
    gridColumns > 1
      ? {
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, max(20rem, calc((100% - ${
            (gridColumns - 1) * 0.75
          }rem) / ${gridColumns}))), 1fr))`,
        }
      : undefined;

  return (
    <Card
      title={t("providers.openai_compatible")}
      description={t("providers.claude_desc")}
      className="flex h-full min-h-0 flex-col"
      bodyClassName="min-h-0 flex flex-1 flex-col"
      loading={loading}
      actions={
        <Button variant="primary" size="sm" onClick={() => openOpenAIEditor(null)}>
          <Plus size={14} />
          {t("providers.add_provider")}
        </Button>
      }
    >
      {providers.length === 0 ? (
        <EmptyState
          title={t("providers.no_openai_providers")}
          description={t("providers.no_openai_desc")}
        />
      ) : (
        <div
          data-testid="providers-tab-scroll"
          className={[
            "min-h-0 flex-1 overflow-y-auto pr-1",
            gridColumns > 1 ? "grid gap-3" : "space-y-3",
          ].join(" ")}
          style={gridStyle}
        >
          {providers.map((provider, idx) => {
            const selectionKey = `${provider.name.trim().toLowerCase()}:${idx}`;
            const selected = selectedKeys?.has(selectionKey) ?? false;
            const headerEntries = Object.entries(provider.headers || {});
            const stats = getProviderStats(provider);
            const statusData = getProviderStatusBar(provider);

            return (
              <ProviderCard
                key={`${provider.name}:${idx}`}
                title={provider.name}
                selected={selected}
                enabled={provider.disabled !== true}
                dimmed={provider.disabled === true}
                onToggleSelected={
                  onToggleSelected
                    ? (checked) => onToggleSelected(selectionKey, checked)
                    : undefined
                }
                onToggleEnabled={
                  onToggleProviderEnabled
                    ? (enabled) => onToggleProviderEnabled(idx, enabled)
                    : undefined
                }
                onEdit={() => openOpenAIEditor(idx)}
                onDelete={() => confirmDelete(idx)}
              >
                {provider.prefix ? (
                  <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                    prefix: {provider.prefix}
                  </p>
                ) : null}
                <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                  baseUrl: {provider.baseUrl || "--"}
                </p>

                {headerEntries.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {headerEntries.map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75"
                        title={`${key}: ${String(value)}`}
                      >
                        <span className="shrink-0 font-semibold">{key}:</span>
                        <span className="min-w-0 truncate">{String(value)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {provider.apiKeyEntries?.length ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                      Keys: {provider.apiKeyEntries.length}
                    </p>
                    <div className="space-y-1">
                      {provider.apiKeyEntries.map((entry, entryIndex) => {
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
                              {entry.proxyUrl ? (
                                <p className="mt-0.5 truncate font-mono text-slate-600 dark:text-white/55">
                                  proxy: {entry.proxyUrl}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 tabular-nums sm:justify-end">
                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 font-semibold",
                                  entryEnabled
                                    ? "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-200",
                                ].join(" ")}
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
                                  onCheckedChange={(enabled) =>
                                    onToggleKeyEntryEnabled(idx, entryIndex, enabled)
                                  }
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-white/65 tabular-nums">
                  <span>
                    {t("providers.models_label")}: {provider.models?.length ?? 0}
                  </span>
                  <span>·</span>
                  <span>{t("providers.success_stats", { count: stats.success })}</span>
                  <span>·</span>
                  <span>{t("providers.failed_stats", { count: stats.failure })}</span>
                  {provider.testModel ? (
                    <>
                      <span>·</span>
                      <span className="truncate">testModel: {provider.testModel}</span>
                    </>
                  ) : null}
                </div>

                {provider.models?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {provider.models.map((model) => {
                      const modelLabel =
                        model.alias && model.alias !== model.name
                          ? `${model.name} → ${model.alias}`
                          : model.name;
                      return (
                        <span
                          key={model.name}
                          className="inline-flex max-w-full min-w-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white dark:bg-white dark:text-neutral-950"
                          title={
                            model.alias && model.alias !== model.name
                              ? `${model.name} => ${model.alias}`
                              : model.name
                          }
                        >
                          <span className="min-w-0 truncate">{modelLabel}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <ProviderStatusBar data={statusData} />
              </ProviderCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
