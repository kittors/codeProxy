import type { ReactNode } from "react";
import type {
  ProviderModel,
  ProviderSimpleConfig,
} from "@code-proxy/api-client";
import { Card, entityCardGridClass } from "@code-proxy/ui";
import { ProviderCard, ProviderCardSkeleton } from "./ProviderCard";
import { EmptyState } from "@code-proxy/ui";
import { ProviderSuccessRateBar } from "./components/ProviderSuccessRateBar";
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
 * Card grid, from the same helper the AI accounts page uses.
 *
 * `content-start` is added on top of it because this grid is a flex child with
 * a resolved height: the default `align-content: stretch` would hand its single
 * row all of that height and drag every card to the bottom of the scroll box.
 *
 * Cards are levelled within a row, as on the accounts page. Letting each end at
 * its own content does not remove empty space, it only moves it: the row is
 * still as tall as its tallest card, so a short card leaves a gap between its
 * bottom edge and the next row. Levelling keeps that space inside the card,
 * where it reads as padding rather than as a hole in the grid.
 */
export const CARD_GRID_CLASS = [
  "min-h-0 flex-1 content-start pr-1",
  entityCardGridClass({ columns: 3, dense: true }),
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
            <ProviderCardSkeleton key={index} dense />
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
            // A channel with no traffic drew twenty grey blocks and a "--":
            // the loudest row on the card, saying nothing. Drop the footer
            // entirely until there is a rate to report.
            const hasStatusData =
              statusData.totalSuccess + statusData.totalFailure > 0;
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
                dense
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
                headerActions={
                  canTest && renderMetricsExtra
                    ? renderMetricsExtra(item, idx, stats)
                    : undefined
                }
                footer={
                  hasStatusData ? <ProviderSuccessRateBar data={statusData} /> : undefined
                }
                header={
                  <>
                {showConnectionRows ? (
                  <ProviderConnectionRows
                    apiKey={item.apiKey}
                    baseUrl={item.baseUrl}
                    proxyUrl={item.proxyUrl}
                    maskApiKey={maskApiKey}
                    showBaseUrl={showBaseUrl}
                  />
                ) : null}

                {/* Zero-valued badges are dropped rather than greyed: a fresh
                    channel showed "Models 0 / Success 0 / Failed 0", three chips
                    that only said the card has nothing to report yet. */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 empty:mt-0">
                  {showModelMetric && models.length ? (
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
                  {stats.success > 0 ? (
                    <ProviderMetricChip
                      tone="emerald"
                      label={t("providers.success_stats", {
                        count: stats.success,
                      })}
                    />
                  ) : null}
                  {stats.failure > 0 ? (
                    <ProviderMetricChip
                      tone="rose"
                      label={t("providers.failed_stats", {
                        count: stats.failure,
                      })}
                    />
                  ) : null}
                </div>

                {headerEntries.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {headerEntries.map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 text-2xs font-semibold leading-none text-slate-700 dark:bg-white/10 dark:text-white/70"
                        title={`${k}: ${String(v)}`}
                      >
                        <span className="shrink-0 font-semibold">{k}:</span>
                        <span className="min-w-0 truncate">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-1.5">
                  <ProviderModelChips models={models} />
                </div>

                {showExcludedModels && excludedModels.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {excludedModels.map((model) => (
                      <span
                        key={model}
                        className="inline-flex h-5 max-w-full min-w-0 items-center rounded-md bg-rose-50 px-1.5 text-2xs font-semibold leading-none text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                        title={model}
                      >
                        <span className="min-w-0 truncate">{model}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                  </>
                }
              >
                {canTest && renderExtra ? renderExtra(item, idx) : null}
              </ProviderCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
