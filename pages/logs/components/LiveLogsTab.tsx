import type { Dispatch, SetStateAction } from "react";
import type { ParsedLogLine } from "../logsHelpers";
import {
  LOG_MUTED_BADGE,
  LOG_NEUTRAL_BADGE,
  getLevelStyles,
  getStatusStyles,
} from "../logsHelpers";
import { Button, ScrollFade, surface } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";

/** 日志行里的小标签：只有淡底、不描边，颜色由调用方按级别 / 状态码给（见 logsHelpers）。 */
function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function RequestPath({ children }: { children: string }) {
  return (
    <code
      className={`inline-block max-w-full rounded-md px-2 py-1 font-mono text-xs font-medium leading-relaxed ${LOG_NEUTRAL_BADGE}`}
    >
      <span className="break-all">{children}</span>
    </code>
  );
}

export function LiveLogsTab({
  t,
  loading,
  refreshing,
  filteredLines,
  visibleLines,
  parsedVisibleLines,
  canLoadMore,
  latestLabel,
  handleRefresh,
  handleDownloadLogs,
  setConfirmClearOpen,
  search,
  setSearch,
  optionsOpen,
  setOptionsOpen,
  autoRefresh,
  setAutoRefresh,
  hideManagement,
  setHideManagement,
  showRawLogs,
  setShowRawLogs,
  quotaSummary,
  scrollToBottom,
  isAtBottom,
  containerRef,
  onScroll,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  loading: boolean;
  refreshing: boolean;
  filteredLines: string[];
  visibleLines: string[];
  parsedVisibleLines: ParsedLogLine[];
  canLoadMore: boolean;
  latestLabel: string;
  handleRefresh: () => void;
  handleDownloadLogs: () => void;
  setConfirmClearOpen: Dispatch<SetStateAction<boolean>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  optionsOpen: boolean;
  setOptionsOpen: Dispatch<SetStateAction<boolean>>;
  autoRefresh: boolean;
  setAutoRefresh: Dispatch<SetStateAction<boolean>>;
  hideManagement: boolean;
  setHideManagement: Dispatch<SetStateAction<boolean>>;
  showRawLogs: boolean;
  setShowRawLogs: Dispatch<SetStateAction<boolean>>;
  quotaSummary: string;
  scrollToBottom: () => void;
  isAtBottom: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  return (
    // 整个页签就是页面本身：标题区、搜索和选项直接落在外壳内容区上（flat），
    // 只有下面的日志列表是一张卡片——以前是「大卡 → 选项小卡 + 日志淡底块 → 描边列表」三层。
    // 不加 overflow-hidden：日志卡片贴着页签底边，裁掉的话卡片的投影会被切掉。
    <Card
      flat
      className="md:flex md:min-h-0 md:flex-1 md:flex-col"
      bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
      title={t("logs_page.live_logs")}
      description={t("logs_page.latest_label", {
        time: latestLabel,
        max: filteredLines.length.toLocaleString(),
      })}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            {t("logs_page.refresh")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadLogs}
            disabled={loading || filteredLines.length === 0}
          >
            {t("logs_page.download")}
          </Button>
          <Button
            variant="secondary-danger"
            size="sm"
            onClick={() => setConfirmClearOpen(true)}
            disabled={loading || refreshing}
          >
            {t("logs_page.clear")}
          </Button>
        </div>
      }
      loading={loading}
    >
      <div className="space-y-3 md:shrink-0">
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={t("logs_page.search_placeholder")}
          type="search"
          name="log_search"
          autoComplete="off"
          spellCheck={false}
        />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ink-2">{quotaSummary}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOptionsOpen((prev) => !prev)}
              className="h-8 px-2 text-xs"
            >
              {optionsOpen ? t("logs_page.collapse_options") : t("logs_page.expand_options")}
            </Button>
          </div>

          {optionsOpen ? (
            <div className="mt-2 grid gap-4 pb-1 sm:grid-cols-2">
              <ToggleSwitch
                label={t("logs_page.auto_refresh")}
                description={t("logs_page.auto_refresh_desc")}
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                disabled={loading}
              />
              <ToggleSwitch
                label={t("logs_page.hide_mgmt")}
                description={t("logs_page.hide_mgmt_desc")}
                checked={hideManagement}
                onCheckedChange={setHideManagement}
                disabled={loading}
              />
              <ToggleSwitch
                label={t("logs_page.show_raw")}
                description={t("logs_page.raw_desc")}
                checked={showRawLogs}
                onCheckedChange={setShowRawLogs}
                disabled={loading}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={[
          surface({ radius: "3xl" }),
          "mt-4 overflow-hidden md:flex md:min-h-0 md:flex-1 md:flex-col",
        ].join(" ")}
      >
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 pt-3 pb-1 text-xs text-ink-2">
          <div className="min-w-0">
            <span className="block whitespace-pre-wrap break-words tabular-nums">
              {t("logs_page.showing_lines", {
                visible: visibleLines.length.toLocaleString(),
                total: filteredLines.length.toLocaleString(),
              })}
              {canLoadMore ? " " + t("logs_page.scroll_up_hint") : ""}
            </span>
          </div>
          <div className="shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToBottom}
              disabled={visibleLines.length === 0 || isAtBottom}
              className={
                visibleLines.length === 0 || isAtBottom ? "pointer-events-none opacity-0" : ""
              }
            >
              {t("logs_page.jump_to_latest")}
            </Button>
          </div>
        </div>
        {/* 列表上下渐隐：表头行下面不画分隔线，滚上去的日志在这里淡出，而不是被硬生生截断。 */}
        <ScrollFade
          ref={containerRef}
          onScroll={onScroll}
          className="max-h-[60vh] overflow-y-auto px-4 pb-3 text-ink md:max-h-none md:min-h-0 md:flex-1"
        >
          {visibleLines.length === 0 ? (
            <div className="px-1 py-4">
              <EmptyState
                title={t("logs_page.no_logs")}
                description={t("logs_page.no_logs_desc")}
              />
            </div>
          ) : showRawLogs ? (
            <pre
              spellCheck={false}
              className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"
            >
              {visibleLines.join("\n")}
            </pre>
          ) : (
            <div className="overflow-x-auto">
              {/* 一行一条日志，行与行之间只留数据行的细分隔线。 */}
              <div className="min-w-[640px] divide-y divide-line">
                {parsedVisibleLines.map((line, index) => {
                  const levelStyles = line.level ? getLevelStyles(line.level) : null;
                  const rowClassName = [
                    "px-3 py-2",
                    "hover:bg-hover",
                    levelStyles?.row,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={`${filteredLines.length - visibleLines.length + index}`}
                      className={rowClassName}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-36 shrink-0 tabular-nums text-xs text-ink-3">
                          {line.timestamp ?? ""}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {line.level ? (
                              <Badge className={levelStyles?.badge ?? ""}>
                                {line.level.toUpperCase()}
                              </Badge>
                            ) : null}
                            {line.source ? (
                              <Badge className={LOG_MUTED_BADGE}>{line.source}</Badge>
                            ) : null}
                            {line.requestId ? (
                              <Badge className={`font-mono ${LOG_NEUTRAL_BADGE}`}>
                                {line.requestId}
                              </Badge>
                            ) : null}
                            {typeof line.statusCode === "number" ? (
                              <Badge className={getStatusStyles(line.statusCode)}>
                                {line.statusCode}
                              </Badge>
                            ) : null}
                            {line.latency ? (
                              <Badge className={LOG_NEUTRAL_BADGE}>{line.latency}</Badge>
                            ) : null}
                            {line.ip ? (
                              <Badge className={`font-mono ${LOG_NEUTRAL_BADGE}`}>{line.ip}</Badge>
                            ) : null}
                            {line.method ? (
                              <Badge className={LOG_NEUTRAL_BADGE}>{line.method}</Badge>
                            ) : null}
                            {line.path ? <RequestPath>{line.path}</RequestPath> : null}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
                            {line.message}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollFade>
      </div>
    </Card>
  );
}
