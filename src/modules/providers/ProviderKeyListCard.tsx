import type { ReactNode } from "react";
import { Loader2, Plus, Zap } from "lucide-react";
import type { ProviderSimpleConfig } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ProviderCard } from "@/modules/providers/ProviderCard";
import { EmptyState } from "@/modules/ui/EmptyState";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import type { KeyStatBucket, StatusBarData } from "@/modules/providers/provider-usage";
import {
  hasDisableAllModelsRule,
  maskApiKey,
  stripDisableAllModelsRule,
} from "@/modules/providers/providers-helpers";
import { formatLatency } from "@/modules/providers/hooks/useProviderLatency";
import type { ProviderAccessSummary } from "@/modules/providers/provider-access";
import { ProviderConnectionRows } from "@/modules/providers/components/ProviderConnectionRows";
import { ProviderMetricChip } from "@/modules/providers/components/ProviderMetricChip";
import { ProviderModelChips } from "@/modules/providers/components/ProviderModelChips";
import { ProviderAccessChips } from "@/modules/providers/components/ProviderAccessChips";

import { useTranslation } from "react-i18next";

export function ProviderKeyListCard({
  title,
  description,
  items,
  loading = false,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
  gridColumns = 2,
  renderExtra,

  getStats,
  getStatusBar,
  getAccessSummary,
  getLatencyEntry,
  checkLatency,
  showBaseUrl = true,
  selectedKeys,
  onToggleSelected,
}: {
  title: string;
  description: string;
  items: ProviderSimpleConfig[];
  loading?: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleEnabled?: (index: number, enabled: boolean) => void;
  gridColumns?: number;
  renderExtra?: (item: ProviderSimpleConfig, index: number) => ReactNode;
  getStats: (item: ProviderSimpleConfig) => KeyStatBucket;
  getStatusBar: (item: ProviderSimpleConfig) => StatusBarData;
  getAccessSummary?: (item: ProviderSimpleConfig) => ProviderAccessSummary | null;
  getLatencyEntry?: (key: string) => { latencyMs: number | null; loading: boolean; error: boolean };
  checkLatency?: (key: string, baseUrl: string) => void;
  showBaseUrl?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelected?: (key: string, checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const gridColumnsClass =
    gridColumns === 4
      ? "grid-cols-1 sm:grid-cols-4"
      : gridColumns === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : gridColumns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1";

  return (
    <Card
      title={title}
      description={description}
      className="flex h-full min-h-0 flex-col"
      bodyClassName="min-h-0 flex flex-1 flex-col"
      loading={loading}
      actions={
        <Button variant="primary" size="sm" onClick={onAdd}>
          <Plus size={14} />
          {t("providers.add_new")}
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState title={t("providers.no_config")} description={t("providers.no_config_desc")} />
      ) : (
        <div
          data-testid="providers-tab-scroll"
          className={[
            "min-h-0 flex-1 overflow-y-auto pr-1",
            gridColumns > 1
              ? ["grid gap-3 items-start content-start", gridColumnsClass].join(" ")
              : "space-y-3",
          ].join(" ")}
        >
          {items.map((item, idx) => {
            const selectionKey = `${item.apiKey.trim().toLowerCase()}:${idx}`;
            const selected = selectedKeys?.has(selectionKey) ?? false;
            const disabled = hasDisableAllModelsRule(item.excludedModels);
            const headerEntries = Object.entries(item.headers || {});
            const excludedModels = stripDisableAllModelsRule(item.excludedModels);
            const models = item.models || [];
            const stats = getStats(item);
            const statusData = getStatusBar(item);
            const accessSummary = getAccessSummary?.(item) ?? null;

            return (
              <ProviderCard
                key={`${item.apiKey}:${idx}`}
                title={item.name || maskApiKey(item.apiKey)}
                selected={selected}
                enabled={!disabled}
                dimmed={disabled}
                onToggleSelected={
                  onToggleSelected
                    ? (checked) => onToggleSelected(selectionKey, checked)
                    : undefined
                }
                onToggleEnabled={
                  onToggleEnabled ? (enabled) => onToggleEnabled(idx, enabled) : undefined
                }
                onEdit={() => onEdit(idx)}
                onDelete={() => onDelete(idx)}
                headerExtra={
                  checkLatency
                    ? (() => {
                        const latencyKey = item.apiKey;
                        const entry = getLatencyEntry?.(latencyKey) ?? {
                          latencyMs: null,
                          loading: false,
                          error: false,
                        };
                        const providerBaseUrl = item.baseUrl || "";
                        return (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/25 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/60 dark:hover:border-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300 dark:focus-visible:ring-blue-300/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (providerBaseUrl) checkLatency(latencyKey, providerBaseUrl);
                            }}
                            aria-label={
                              providerBaseUrl
                                ? `Check latency: ${providerBaseUrl}`
                                : "No base URL configured"
                            }
                            title={
                              providerBaseUrl
                                ? `Check latency: ${providerBaseUrl}`
                                : "No base URL configured"
                            }
                          >
                            {entry.loading ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : entry.error ? (
                              <span className="text-rose-500">×</span>
                            ) : entry.latencyMs !== null ? (
                              <span className="font-medium">{formatLatency(entry.latencyMs)}</span>
                            ) : (
                              <Zap size={10} />
                            )}
                          </button>
                        );
                      })()
                    : undefined
                }
              >
                <ProviderConnectionRows
                  apiKey={item.apiKey}
                  baseUrl={item.baseUrl}
                  proxyUrl={item.proxyUrl}
                  maskApiKey={maskApiKey}
                  showBaseUrl={showBaseUrl}
                />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ProviderMetricChip
                    tone="blue"
                    label={t("providers.models_label")}
                    value={models.length}
                  />
                  {excludedModels.length ? (
                    <ProviderMetricChip
                      tone="rose"
                      label={t("providers.excluded_models_label")}
                      value={excludedModels.length}
                    />
                  ) : null}
                  {headerEntries.length ? (
                    <ProviderMetricChip
                      tone="slate"
                      label={t("providers.headers_optional")}
                      value={headerEntries.length}
                      title={`${headerEntries.length} header(s)`}
                    />
                  ) : null}
                  <ProviderMetricChip
                    tone={stats.success > 0 ? "emerald" : "slate"}
                    label={t("providers.success_stats", { count: stats.success })}
                  />
                  <ProviderMetricChip
                    tone={stats.failure > 0 ? "rose" : "slate"}
                    label={t("providers.failed_stats", { count: stats.failure })}
                  />
                </div>

                <div className="mt-2">
                  <ProviderAccessChips accessSummary={accessSummary} />
                </div>

                {headerEntries.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {headerEntries.map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75"
                        title={`${k}: ${String(v)}`}
                      >
                        <span className="shrink-0 font-semibold">{k}:</span>
                        <span className="min-w-0 truncate">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-1.5">
                  <ProviderModelChips
                    models={models}
                    maxVisible={gridColumns >= 4 ? 4 : 6}
                  />
                </div>

                {excludedModels.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {excludedModels.map((model) => (
                      <span
                        key={model}
                        className="inline-flex max-w-full min-w-0 rounded-full bg-rose-600/10 px-2 py-0.5 text-[11px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                        title={model}
                      >
                        <span className="min-w-0 truncate">{model}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {renderExtra ? renderExtra(item, idx) : null}

                <ProviderStatusBar data={statusData} />
              </ProviderCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
