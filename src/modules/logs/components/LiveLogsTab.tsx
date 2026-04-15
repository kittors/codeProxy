import type { Dispatch, SetStateAction } from "react";
import type { ParsedLogLine } from "@/modules/logs/logsHelpers";
import { getLevelStyles, getStatusStyles } from "@/modules/logs/logsHelpers";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { Card } from "@/modules/ui/Card";

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        className,
      ].join(" ")}
    >
      {children}
    </span>
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
    <Card
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
            variant="danger"
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
      <div className="space-y-3">
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={t("logs_page.search_placeholder")}
          type="search"
          name="log_search"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-white/65">{quotaSummary}</div>
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
            <div className="mt-3 grid gap-4 border-t border-slate-200 pt-4 dark:border-neutral-800 sm:grid-cols-2">
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

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-neutral-800 dark:text-white/65">
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
              className={visibleLines.length === 0 || isAtBottom ? "pointer-events-none opacity-0" : ""}
            >
              {t("logs_page.jump_to_latest")}
            </Button>
          </div>
        </div>
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="max-h-[60vh] overflow-y-auto bg-slate-50 px-4 py-3 text-slate-900 dark:bg-neutral-950/60 dark:text-slate-100"
        >
          {visibleLines.length === 0 ? (
            <div className="px-1 py-4">
              <EmptyState
                title={t("logs_page.no_logs")}
                description={t("logs_page.no_logs_desc")}
              />
            </div>
          ) : showRawLogs ? (
            <pre spellCheck={false} className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {visibleLines.join("\n")}
            </pre>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px] divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white/70 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950/40">
                {parsedVisibleLines.map((line, index) => {
                  const levelStyles = line.level ? getLevelStyles(line.level) : null;
                  const rowClassName = [
                    "px-3 py-2",
                    "hover:bg-slate-50 dark:hover:bg-white/5",
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
                        <div className="w-36 shrink-0 tabular-nums text-[11px] text-slate-500 dark:text-white/55">
                          {line.timestamp ?? ""}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {line.level ? <Badge className={levelStyles?.badge ?? ""}>{line.level.toUpperCase()}</Badge> : null}
                            {line.source ? (
                              <Badge className="border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                {line.source}
                              </Badge>
                            ) : null}
                            {line.requestId ? (
                              <Badge className="border-slate-200 bg-slate-50 font-mono text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70">
                                {line.requestId}
                              </Badge>
                            ) : null}
                            {typeof line.statusCode === "number" ? (
                              <Badge className={getStatusStyles(line.statusCode)}>
                                {line.statusCode}
                              </Badge>
                            ) : null}
                            {line.latency ? (
                              <Badge className="border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                {line.latency}
                              </Badge>
                            ) : null}
                            {line.ip ? (
                              <Badge className="border-slate-200 bg-white font-mono text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                {line.ip}
                              </Badge>
                            ) : null}
                            {line.method ? (
                              <Badge className="border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                {line.method}
                              </Badge>
                            ) : null}
                            {line.path ? (
                              <Badge className="border-slate-200 bg-white font-mono text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                <span className="break-all">{line.path}</span>
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100">
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
        </div>
      </div>
    </Card>
  );
}
