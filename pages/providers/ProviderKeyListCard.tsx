import type { ReactNode } from "react";
import type {
  ProviderModel,
  ProviderSimpleConfig,
} from "@code-proxy/api-client";
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
import { ProviderConnectionRows } from "./components/ProviderConnectionRows";
import { ProviderMetricChip } from "./components/ProviderMetricChip";
import { ProviderModelChips } from "./components/ProviderModelChips";
import { ProviderIdCopyButton } from "./components/ProviderIdCopyButton";
import { ProviderLatencyButton } from "./components/ProviderLatencyButton";

import { useTranslation } from "react-i18next";
import { useOptionalAuth } from "@app/providers/AuthProvider";

/**
 * Responsive card grid, mirroring the AI accounts page.
 *
 * `content-start` is load-bearing: this grid is a flex child with a resolved
 * height, so the default `align-content: stretch` hands the single row all of
 * that height and every card is dragged down to the bottom of the scroll box.
 * With `start`, the row is as tall as its tallest card and `items-stretch` (plus
 * the card's own `h-full`) keeps siblings in a row the same height.
 *
 * Below `md` cards centre inside one column and cap at `max-w-[34rem]`; from
 * `md` up they stretch to fill their column.
 */
export const CARD_GRID_CLASS = [
  "grid min-h-0 flex-1 content-start items-stretch justify-items-center gap-5 pr-1",
  "grid-cols-1 md:grid-cols-2 md:justify-items-stretch xl:grid-cols-[repeat(3,minmax(0,1fr))]",
].join(" ");

/**
 * Validate a caller-supplied order before rendering with it.
 *
 * A malformed order must degrade to configured order rather than dropping or
 * duplicating credentials: this list is how an operator edits and deletes them,
 * and a card that silently disappears is worse than one shown out of order.
 */
function resolveRenderOrder(
  count: number,
  displayOrder: readonly number[] | undefined,
): number[] {
  const natural = Array.from({ length: count }, (_, index) => index);
  if (!displayOrder || displayOrder.length !== count) return natural;
  const seen = new Set<number>();
  for (const index of displayOrder) {
    if (!Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) {
      return natural;
    }
    seen.add(index);
  }
  return [...displayOrder];
}

export function ProviderKeyListCard({
  items,
  loading = false,
  onEdit,
  onDelete,
  onToggleEnabled,
  isItemEnabled,
  renderExtra,
  getDisplayModels,

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
  displayOrder,
}: {
  items: ProviderSimpleConfig[];
  loading?: boolean;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleEnabled?: (index: number, enabled: boolean) => void;
  isItemEnabled?: (item: ProviderSimpleConfig) => boolean;
  renderExtra?: (item: ProviderSimpleConfig, index: number) => ReactNode;
  getDisplayModels?: (
    item: ProviderSimpleConfig,
    index: number,
  ) => ProviderModel[];
  renderMetricsExtra?: (
    item: ProviderSimpleConfig,
    index: number,
    stats: KeyStatBucket,
  ) => ReactNode;
  getStats: (item: ProviderSimpleConfig) => KeyStatBucket;
  getStatusBar: (item: ProviderSimpleConfig) => StatusBarData;
  getLatencyEntry?: (key: string) => {
    latencyMs: number | null;
    loading: boolean;
    error: boolean;
  };
  checkLatency?: (key: string, baseUrl: string) => void;
  showBaseUrl?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelected?: (key: string, checked: boolean) => void;
  naturalHeight?: boolean;
  showConnectionRows?: boolean;
  showModelMetric?: boolean;
  showExcludedModels?: boolean;
  /**
   * Positions into `items`, in the order the cards should appear.
   *
   * Reordering `items` itself is not an option: the index handed to onEdit,
   * onDelete and renderExtra identifies the credential in the saved config and
   * keys its usage cache, so a shuffled array would edit one credential while
   * showing another's usage. Omit to render in configured order.
   */
  displayOrder?: readonly number[];
}) {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const canWrite = auth?.can("providers.write") ?? true;
  const canTest = auth?.can("providers.test") ?? true;
  const canUseAPITools = auth?.state.principal
    ? canTest && auth.state.principal.effective_tenant.type === "system"
    : canTest;
  const showSkeleton = loading && items.length === 0;

  return (
    // No add button here: the page toolbar already exposes the same
    // openKeyEditor(tab, null) action, and two of them on one screen just made
    // the header noisier.
    <Card
      // 用 flex-1 而不是 h-full：父级高度是 flex 分配出来的，百分比高度在这条链上解析
      // 不到基准，会回退成内容高度，卡片就缩成一小块、底下空一大片。
      className="flex min-h-0 flex-1 flex-col"
      bodyClassName="min-h-0 flex flex-1 flex-col"
    >
      {showSkeleton ? (
        <div
          role="status"
          aria-label={t("common.loading")}
          data-testid="providers-list-skeleton"
          className={`${CARD_GRID_CLASS} overflow-hidden`}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <ProviderCardSkeleton key={index} naturalHeight={naturalHeight} />
          ))}
        </div>
      ) : items.length === 0 ? (
        // 空态要占住整块卡片区域：不撑满的话卡片只有内容那么高，页面底部会空出一大截
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState
            title={t("providers.no_config")}
            description={t("providers.no_config_desc")}
          />
        </div>
      ) : (
        <div
          data-testid="providers-tab-scroll"
          className={`${CARD_GRID_CLASS} overflow-y-auto`}
        >
          {resolveRenderOrder(items.length, displayOrder).map((idx) => {
            const item = items[idx];
            if (!item) return null;
            const selectionKey = `${item.apiKey.trim().toLowerCase()}:${idx}`;
            const selected = selectedKeys?.has(selectionKey) ?? false;
            const disabled = !(isItemEnabled
              ? isItemEnabled(item)
              : !hasDisableAllModelsRule(item.excludedModels));
            const headerEntries = Object.entries(item.headers || {});
            const excludedModels = stripDisableAllModelsRule(
              item.excludedModels,
            );
            const models = getDisplayModels
              ? getDisplayModels(item, idx)
              : item.models || [];
            const stats = getStats(item);
            const statusData = getStatusBar(item);
            const latencyEntry =
              canUseAPITools && checkLatency
                ? (getLatencyEntry?.(item.apiKey) ?? {
                    latencyMs: null,
                    loading: false,
                    error: false,
                  })
                : null;
            // Built up front so the header only renders a badge row when there
            // is a badge to put in it.
            const headerBadges =
              item.id || latencyEntry ? (
                <>
                  {item.id ? <ProviderIdCopyButton id={item.id} /> : null}
                  {latencyEntry && checkLatency ? (
                    <ProviderLatencyButton
                      entry={latencyEntry}
                      baseUrl={item.baseUrl || ""}
                      onCheck={() =>
                        checkLatency(item.apiKey, item.baseUrl || "")
                      }
                    />
                  ) : null}
                </>
              ) : undefined;

            return (
              <ProviderCard
                key={`${item.apiKey}:${idx}`}
                title={item.name || maskApiKey(item.apiKey)}
                selected={selected}
                enabled={!disabled}
                dimmed={disabled}
                naturalHeight={naturalHeight}
                className="motion-safe:animate-[fadeInUp_0.22s_ease-out]"
                onToggleSelected={
                  onToggleSelected
                    ? (checked) => onToggleSelected(selectionKey, checked)
                    : undefined
                }
                onToggleEnabled={
                  canWrite && onToggleEnabled
                    ? (enabled) => onToggleEnabled(idx, enabled)
                    : undefined
                }
                onEdit={canWrite ? () => onEdit(idx) : undefined}
                onDelete={canWrite ? () => onDelete(idx) : undefined}
                headerExtra={headerBadges}
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
                    label={t("providers.success_stats", {
                      count: stats.success,
                    })}
                  />
                  <ProviderMetricChip
                    tone={stats.failure > 0 ? "rose" : "slate"}
                    label={t("providers.failed_stats", {
                      count: stats.failure,
                    })}
                  />
                  {canTest && renderMetricsExtra ? (
                    <div className="ml-auto">
                      {renderMetricsExtra(item, idx, stats)}
                    </div>
                  ) : null}
                </div>

                {headerEntries.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {headerEntries.map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-slate-900/8 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-white/8 dark:bg-neutral-950/60 dark:text-white/75"
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
                        className="inline-flex max-w-full min-w-0 rounded-full bg-rose-600/10 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                        title={model}
                      >
                        <span className="min-w-0 truncate">{model}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {canTest && renderExtra ? renderExtra(item, idx) : null}
              </ProviderCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
