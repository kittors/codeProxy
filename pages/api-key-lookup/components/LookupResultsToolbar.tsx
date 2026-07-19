import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button, HoverTooltip, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { TimeRangeSelector } from "@features/monitor-widgets";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";

export type ApiKeyLookupTab = "usage" | "keys" | "logs" | "models" | "quickImport";

/** sticky top-3 = 0.75rem */
const STICKY_TOP_OFFSET_PX = 12;
/** 亚像素容差，避免临界抖动 */
const STUCK_EPSILON_PX = 1;

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
  showKeysTab = false,
  keysHeader,
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
  /** Portal login: show “管理 API Key” as the 2nd tab. */
  showKeysTab?: boolean;
  /** keys tab：标题 + 刷新/新建 与 tabs 同吸顶，避免滚动后消失。 */
  keysHeader?: {
    loading?: boolean;
    busy?: boolean;
    onRefresh: () => void;
    onCreate: () => void;
  };
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const showKeysHeader = activeTab === "keys" && keysHeader;

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
        "sticky top-3 z-20 -mx-1 space-y-3 rounded-2xl px-1.5 py-1.5 backdrop-blur-md",
        "motion-safe:transition-[border-color,box-shadow,background-color] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
        stuck
          ? "border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-neutral-950/85 dark:shadow-black/25"
          : "border border-transparent bg-white/80 dark:bg-neutral-950/70",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          >
            <TabsList>
              <TabsTrigger value="usage">{t("apikey_lookup.usage_stats")}</TabsTrigger>
              {showKeysTab ? (
                <TabsTrigger value="keys">
                  {t("apikey_lookup.manage_keys", { defaultValue: "管理 API Key" })}
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="logs">{t("apikey_lookup.request_logs")}</TabsTrigger>
              <TabsTrigger value="models">{t("model_plaza.title")}</TabsTrigger>
              <TabsTrigger value="quickImport">{t("apikey_lookup.quick_import")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {activeTab === "usage" || activeTab === "logs" ? (
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          ) : null}
        </div>
        {!showKeysHeader ? (
          <div className="flex items-center gap-2">
            <HoverTooltip content={t("common.refresh")}>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || chartLoading || modelsLoading}
                aria-label={t("common.refresh")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <RefreshCw
                  size={16}
                  className={loading || chartLoading || modelsLoading ? "animate-spin" : ""}
                />
              </button>
            </HoverTooltip>
          </div>
        ) : null}
      </div>

      {showKeysHeader ? (
        <div
          data-testid="apikey-lookup-keys-header-sticky"
          className="flex flex-wrap items-start justify-between gap-3 px-0.5 pb-0.5"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("apikey_lookup.manage_keys", { defaultValue: "管理 API Key" })}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
              {t("apikey_lookup.manage_keys_desc", {
                defaultValue: "管理本账号下全部 API Key。查看用量以弹窗打开，不会离开当前页。",
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={keysHeader.onRefresh}
              disabled={keysHeader.loading || keysHeader.busy}
            >
              <RefreshCw size={14} className={keysHeader.loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
            <Button size="sm" variant="primary" onClick={keysHeader.onCreate} disabled={keysHeader.busy}>
              <Plus size={14} />
              {t("apikey_lookup.create_key", { defaultValue: "新建 Key" })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
