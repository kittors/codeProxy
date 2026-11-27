import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "@code-proxy/ui/icons";
import { HoverTooltip, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { TimeRangeSelector } from "@features/monitor-widgets";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";
import type { PublicQuotaScope, PublicUsageLimits } from "../types";
import { buildQuotaKpiItems } from "./QuotaLimitsBanner";

export type ApiKeyLookupTab = "usage" | "keys" | "billing" | "words" | "privacy" | "logs" | "models" | "quickImport";

/** sticky top-3 = 0.75rem */
const STICKY_TOP_OFFSET_PX = 12;
/** 亚像素容差，避免临界抖动 */
const STUCK_EPSILON_PX = 1;

const DEFAULT_TABS: ApiKeyLookupTab[] = ["usage", "keys", "billing", "words", "privacy", "logs", "models", "quickImport"];

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
  showBillingTab = false,
  showWordsTab = false,
  showPrivacyTab = false,
  tabs,
  pinned = false,
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
  /** Portal login when tenant billing is enabled: show self-service recharge & renewal tab. */
  showBillingTab?: boolean;
  /** Portal login whose tenant lets the account keep sensitive words of its own. */
  showWordsTab?: boolean;
  /** Portal login on a backend with portal privacy masking (read-only for every account). */
  showPrivacyTab?: boolean;
  /** Restrict visible tabs (e.g. public key usage page only needs logs + quick import). */
  tabs?: ApiKeyLookupTab[];
  /** 视口锁定模式（如请求日志桌面端一屏定高）：无需粘性漂浮，紧贴顶部节省垂直空间。 */
  pinned?: boolean;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const visibleTabs = tabs?.length ? tabs : DEFAULT_TABS;
  const renderTabTrigger = (tab: ApiKeyLookupTab) => {
    switch (tab) {
      case "usage":
        return (
          <TabsTrigger key="usage" value="usage">
            {t("apikey_lookup.usage_stats")}
          </TabsTrigger>
        );
      case "keys":
        return showKeysTab ? (
          <TabsTrigger key="keys" value="keys">
            {t("apikey_lookup.manage_keys", { defaultValue: "管理 API Key" })}
          </TabsTrigger>
        ) : null;
      case "billing":
        return showBillingTab ? (
          <TabsTrigger key="billing" value="billing">
            {t("apikey_lookup.billing_tab")}
          </TabsTrigger>
        ) : null;
      case "words":
        return showWordsTab ? (
          <TabsTrigger key="words" value="words">
            {t("apikey_lookup.words_tab")}
          </TabsTrigger>
        ) : null;
      case "privacy":
        return showPrivacyTab ? (
          <TabsTrigger key="privacy" value="privacy">
            {t("apikey_lookup.privacy_tab")}
          </TabsTrigger>
        ) : null;
      case "logs":
        return (
          <TabsTrigger key="logs" value="logs">
            {t("apikey_lookup.request_logs")}
          </TabsTrigger>
        );
      case "models":
        return (
          <TabsTrigger key="models" value="models">
            {t("model_plaza.title")}
          </TabsTrigger>
        );
      case "quickImport":
        return (
          <TabsTrigger key="quickImport" value="quickImport">
            {t("apikey_lookup.quick_import")}
          </TabsTrigger>
        );
    }
  };
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
      className={[
        "shrink-0 z-20",
        pinned
          ? "py-0.5 shadow-none"
          : [
              "sticky top-3 rounded-xl px-2 py-1.5 -mx-2",
              "motion-safe:transition-[box-shadow,background-color,border-color] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
              stuck
                ? "border border-sn-line bg-sn-raised shadow-sn-e1"
                : "bg-transparent shadow-none",
            ].join(" "),
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Tabs
          value={activeTab}
          tone="brand"
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
        >
          <TabsList>{visibleTabs.map((tab) => renderTabTrigger(tab))}</TabsList>
        </Tabs>
        {activeTab === "usage" || activeTab === "logs" ? (
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} tone="brand" />
        ) : null}
        {logsQuotaItems.length > 0 ? (
          <div
            data-testid="apikey-lookup-logs-quota"
            className="flex flex-wrap items-center gap-1.5"
          >
            {logsQuotaItems.map((item) => {
              const ratio = item.limit > 0 ? Math.min(1, Math.max(0, item.used / item.limit)) : 0;
              const barTone =
                ratio >= 0.95
                  ? "bg-rose-500"
                  : ratio >= 0.8
                    ? "bg-amber-500"
                    : "bg-sn-label/75";
              return (
                <div
                  key={item.key}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-sn-line bg-sn-raised px-2.5 text-xs text-sn-label2"
                >
                  <span className="text-sn-label3">{item.title}</span>
                  <span className="font-mono font-semibold tabular-nums text-sn-label">
                    {item.format(item.used)} / {item.format(item.limit)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden h-1.5 w-8 overflow-hidden rounded-full bg-sn-sunken sm:inline-block"
                  >
                    <span
                      className={`block h-full rounded-full transition-transform duration-300 origin-left ${barTone}`}
                      style={{ transform: `scaleX(${Math.max(ratio, ratio > 0 ? 0.06 : 0)})` }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {/* 敏感词、隐私脱敏、充值续费标签有自己的保存与刷新；这里的刷新会打断草稿，不放。 */}
        <div
          className={
            activeTab === "words" || activeTab === "privacy" || activeTab === "billing"
              ? "hidden"
              : activeTab === "keys"
                ? "ml-auto hidden items-center gap-2 sm:flex"
                : "ml-auto flex items-center gap-2"
          }
        >
          <HoverTooltip content={t("common.refresh")}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || chartLoading || modelsLoading}
              aria-label={t("common.refresh")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-sn-label2 transition-[background-color,border-color,color,transform] duration-150 hover:border-sn-line hover:bg-sn-hover hover:text-sn-label active:scale-95 disabled:opacity-40"
            >
              <RefreshCw
                size={15}
                className={loading || chartLoading || modelsLoading ? "animate-spin" : ""}
              />
            </button>
          </HoverTooltip>
        </div>
      </div>
    </div>
  );
}
