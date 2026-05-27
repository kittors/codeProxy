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
            gridColumns > 1 ? "grid gap-3" : "space-y-3",
          ].join(" ")}
          style={gridStyle}
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
            const accessTone =
              accessSummary === null || accessSummary.totalKeys === 0
                ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/65"
                : accessSummary.reachableKeys === 0
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  : accessSummary.reachableKeys < accessSummary.totalKeys
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";

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
                <div className="space-y-1 text-xs text-slate-600 dark:text-white/65">
                  <p className="truncate font-mono">apiKey：{maskApiKey(item.apiKey)}</p>
                  {showBaseUrl ? (
                    <p className="truncate font-mono">baseUrl：{item.baseUrl || "--"}</p>
                  ) : null}
                  {item.proxyUrl ? (
                    <p className="truncate font-mono">proxyUrl：{item.proxyUrl}</p>
                  ) : null}
                  <p className="tabular-nums">
                    {t("providers.models_label")}: {models.length} ·{" "}
                    {t("providers.excluded_models_label")}: {excludedModels.length} ·{" "}
                    {t("providers.headers_optional")}: {headerEntries.length} ·{" "}
                    {t("providers.success_stats", { count: stats.success })} ·{" "}
                    {t("providers.failed_stats", { count: stats.failure })}
                  </p>
                </div>

                {accessSummary ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 font-medium ${accessTone}`}>
                      {accessSummary.totalKeys === 0
                        ? t("providers.access_no_keys")
                        : accessSummary.reachableKeys === 0
                          ? t("providers.access_none")
                          : accessSummary.reachableKeys < accessSummary.totalKeys
                            ? t("providers.access_limited", {
                                reachable: accessSummary.reachableKeys,
                                total: accessSummary.totalKeys,
                              })
                            : t("providers.access_all", { total: accessSummary.totalKeys })}
                    </span>
                    {accessSummary.exactOverrideKeys > 0 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                        {t("providers.access_exact_overrides", {
                          count: accessSummary.exactOverrideKeys,
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}

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

                {models.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {models.map((model) => {
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

                {excludedModels.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
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
