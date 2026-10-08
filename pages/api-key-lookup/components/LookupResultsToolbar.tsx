import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { HoverTooltip, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { TimeRangeSelector } from "@features/monitor-widgets";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";
import type { PublicQuotaScope, PublicUsageLimits } from "../types";
import { buildQuotaKpiItems } from "./QuotaLimitsBanner";

export type ApiKeyLookupTab = "usage" | "keys" | "logs" | "models" | "quickImport";

/** sticky top-3 = 0.75rem */
const STICKY_TOP_OFFSET_PX = 12;
/** 亚像素容差，避免临界抖动 */
const STUCK_EPSILON_PX = 1;

const DEFAULT_TABS: ApiKeyLookupTab[] = ["usage", "keys", "logs", "models", "quickImport"];

export function LookupResultsToolbar({
  t,
  activeTab,
  setActiveTab,
  timeRange,
  setTimeRange,
  handleRefresh,
  loading,
  chartLoading,
  modelsLoading,
  quotaLimits,
  quotaScopes,
  showKeysTab = false,
  tabs,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  activeTab: ApiKeyLookupTab;
  setActiveTab: (value: ApiKeyLookupTab) => void;
  timeRange: TimeRange;
  setTimeRange: (value: TimeRange) => void;
  handleRefresh: () => void;
  loading: boolean;
  chartLoading: boolean;
  modelsLoading: boolean;
  quotaLimits?: PublicUsageLimits | null;
  quotaScopes?: PublicQuotaScope[] | null;
  /** Portal login: show “管理 API Key” as the 2nd tab. */
  showKeysTab?: boolean;
  /** Restrict visible tabs (e.g. public key usage page only needs logs + quick import). */
  tabs?: ApiKeyLookupTab[];
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const visibleTabs = tabs?.length ? tabs : DEFAULT_TABS;
  const showTab = (tab: ApiKeyLookupTab) => visibleTabs.includes(tab);
  const logsQuotaItems =
    activeTab === "logs" ? buildQuotaKpiItems(t, quotaLimits, quotaScopes) : [];

  // 不要再用短 relative 包裹 sticky：sticky 只能在「包含块」高度内钉住，
  // 外层高度≈自身时，一滚就会整段被带走，表现为「没吸顶、飘走」。
  // stuck 用元素自身 getBoundingClientRect 判断，避免 sentinel 再引入包裹层。
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    let frame = 0;
    const syncStuck = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top;
      const next = top <= STICKY_TOP_OFFSET_PX + STUCK_EPSILON_PX;
      setStuck((prev) => (prev === next ? prev : next));
    };
    const onScrollOrResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncStuck);
    };

    syncStuck();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // sticky 直接作为 main 子节点；不要在祖先加 overflow-x-hidden。
    <div
      ref={toolbarRef}
      data-testid="apikey-lookup-toolbar-sticky"
      data-stuck={stuck ? "true" : "false"}
      // 吸顶后才成为一块浮起的卡片：伪元素细边（cp-edge）+ 卡片投影 + 卡片色的半透明底，
      // 不画 ring；没吸顶时完全透明，和页面融为一体。cp-edge 的 position: relative 在
      // components 层，盖不过这里 utilities 层的 sticky。
      className={[
        "sticky top-3 z-20 -mx-1 space-y-3 rounded-3xl px-2 py-2 backdrop-blur-md",
        "motion-safe:transition-[box-shadow,background-color] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
        stuck ? "cp-edge bg-surface/90 shadow-card" : "bg-transparent shadow-none",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={activeTab}
            tone="brand"
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          >
            <TabsList>
              {showTab("usage") ? (
                <TabsTrigger value="usage">{t("apikey_lookup.usage_stats")}</TabsTrigger>
              ) : null}
              {showTab("keys") && showKeysTab ? (
                <TabsTrigger value="keys">
                  {t("apikey_lookup.manage_keys", { defaultValue: "管理 API Key" })}
                </TabsTrigger>
              ) : null}
              {showTab("logs") ? (
                <TabsTrigger value="logs">{t("apikey_lookup.request_logs")}</TabsTrigger>
              ) : null}
              {showTab("models") ? (
                <TabsTrigger value="models">{t("model_plaza.title")}</TabsTrigger>
              ) : null}
              {showTab("quickImport") ? (
                <TabsTrigger value="quickImport">{t("apikey_lookup.quick_import")}</TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
          {activeTab === "usage" || activeTab === "logs" ? (
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} tone="brand" />
          ) : null}
          {logsQuotaItems.length > 0 ? (
            <div
              data-testid="apikey-lookup-logs-quota"
              className="flex flex-wrap items-center gap-1.5"
            >
              {logsQuotaItems.map((item) => (
                <div
                  key={item.key}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ink/[0.05] px-2 py-1 text-xs text-ink-2 dark:bg-white/[0.07]"
                >
                  <span>{item.title}</span>
                  <span className="font-mono font-semibold tabular-nums text-ink">
                    {item.format(item.used)} / {item.format(item.limit)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div
          className={
            activeTab === "keys" ? "hidden items-center gap-2 sm:flex" : "flex items-center gap-2"
          }
        >
          <HoverTooltip content={t("common.refresh")}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || chartLoading || modelsLoading}
              aria-label={t("common.refresh")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              <RefreshCw
                size={16}
                className={loading || chartLoading || modelsLoading ? "animate-spin" : ""}
              />
            </button>
          </HoverTooltip>
        </div>
      </div>
    </div>
  );
}
