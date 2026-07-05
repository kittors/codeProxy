import type { ReactNode } from "react";
import { Loader2, Plus, Zap } from "lucide-react";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { ProviderCard, ProviderCardSkeleton } from "./ProviderCard";
import { EmptyState } from "@code-proxy/ui";
import { ProviderStatusBar } from "@features/provider-latency";
import type { KeyStatBucket, StatusBarData } from "@code-proxy/domain";
import {
  hasDisableAllModelsRule,
  maskApiKey,
  stripDisableAllModelsRule,
} from "./providers-helpers";
import { formatLatency } from "./hooks/useProviderLatency";
import { ProviderConnectionRows } from "./components/ProviderConnectionRows";
import { ProviderMetricChip } from "./components/ProviderMetricChip";
import { ProviderModelChips } from "./components/ProviderModelChips";

import { useTranslation } from "react-i18next";

export function ProviderKeyListCard({
  items,
  loading = false,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
  renderExtra,

  getStats,
  getStatusBar,
  getLatencyEntry,
  checkLatency,
  showBaseUrl = true,
  selectedKeys,
  onToggleSelected,
  naturalHeight = false,
  showConnectionRows = true,
  showModelMetric = true,
  showExcludedModels = true,
  renderMetricsExtra,
}: {
  items: ProviderSimpleConfig[];
  loading?: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleEnabled?: (index: number, enabled: boolean) => void;
  renderExtra?: (item: ProviderSimpleConfig, index: number) => ReactNode;
  renderMetricsExtra?: (
    item: ProviderSimpleConfig,
    index: number,
    stats: KeyStatBucket,
  ) => ReactNode;
  getStats: (item: ProviderSimpleConfig) => KeyStatBucket;
  getStatusBar: (item: ProviderSimpleConfig) => StatusBarData;
  getLatencyEntry?: (key: string) => { latencyMs: number | null; loading: boolean; error: boolean };
  checkLatency?: (key: string, baseUrl: string) => void;
  showBaseUrl?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelected?: (key: string, checked: boolean) => void;
  naturalHeight?: boolean;
  showConnectionRows?: boolean;
  showModelMetric?: boolean;
  showExcludedModels?: boolean;
}) {
  const { t } = useTranslation();
  const showSkeleton = loading && items.length === 0;

  return (
    <Card
      className="flex h-full min-h-0 flex-col"
      bodyClassName="min-h-0 flex flex-1 flex-col"
      actions={
        <Button variant="primary" size="sm" onClick={onAdd}>
          <Plus size={14} />
          {t("providers.add_new")}
        </Button>
      }
    >
      {showSkeleton ? (
        <div
          role="status"
          aria-label={t("common.loading")}
          data-testid="providers-list-skeleton"
          className={[
            "min-h-0 flex-1 overflow-hidden pr-1 gap-3 items-start content-start justify-start",
            naturalHeight ? "flex flex-wrap" : "grid",
          ].join(" ")}
          style={
            naturalHeight
              ? undefined
              : { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 18rem), 22rem))" }
          }
        >
          {Array.from({ length: 6 }, (_, index) => (
            <ProviderCardSkeleton key={index} naturalHeight={naturalHeight} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t("providers.no_config")} description={t("providers.no_config_desc")} />
      ) : (
        <div
          data-testid="providers-tab-scroll"
          className={[
            "min-h-0 flex-1 overflow-y-auto pr-1 gap-3 items-start content-start justify-start",
            naturalHeight ? "flex flex-wrap" : "grid",
          ].join(" ")}
          style={
            naturalHeight
              ? undefined
              : { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 18rem), 22rem))" }
          }
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

            return (
              <ProviderCard
                key={`${item.apiKey}:${idx}`}
                title={item.name || maskApiKey(item.apiKey)}
                selected={selected}
                enabled={!disabled}
                dimmed={disabled}
                naturalHeight={naturalHeight}
                className={naturalHeight ? "w-full max-w-[22rem] flex-none" : undefined}
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
                        const latencyMs = entry.latencyMs;
                        const latencyColor =
                          latencyMs === null
                            ? "text-slate-400 dark:text-white/40"
                            : latencyMs < 200
                              ? "text-emerald-600 dark:text-emerald-400"
                              : latencyMs < 500
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400";
                        return (
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tabular-nums font-medium transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 dark:hover:bg-white/10 dark:focus-visible:ring-white/20 ${entry.loading ? "text-slate-500" : entry.error ? "text-rose-500" : latencyColor}`}
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
                              <span>×</span>
                            ) : latencyMs !== null ? (
                              <span>{formatLatency(latencyMs)}</span>
                            ) : (
                              <Zap size={10} />
                            )}
                          </button>
                        );
                      })()
                    : undefined
                }
                footer={<ProviderStatusBar data={statusData} />}
              >
                {showConnectionRows ? (
                  <ProviderConnectionRows
                    apiKey={item.apiKey}
                    baseUrl={item.baseUrl}
                    proxyUrl={item.proxyUrl}
                    maskApiKey={maskApiKey}
                    showBaseUrl={showBaseUrl}
                  />
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {showModelMetric ? (
                    <ProviderMetricChip
                      tone="blue"
                      label={t("providers.models_label")}
                      value={models.length}
                    />
                  ) : null}
                  {showExcludedModels && excludedModels.length ? (
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
                  {renderMetricsExtra ? (
                    <div className="ml-auto">{renderMetricsExtra(item, idx, stats)}</div>
                  ) : null}
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
                  <ProviderModelChips models={models} maxVisible={6} />
                </div>

                {showExcludedModels && excludedModels.length ? (
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
              </ProviderCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
