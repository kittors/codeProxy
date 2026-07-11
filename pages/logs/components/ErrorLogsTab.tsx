import type { Dispatch, SetStateAction } from "react";
import type { ErrorLogItem } from "../logsHelpers";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const textValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const numberValue = (value: number | undefined): string | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return String(value);
};

const formatRoute = (file: ErrorLogItem): string | undefined => {
  const group = textValue(file.route_group);
  const path = textValue(file.route_path);
  if (group && path) return `${group} · ${path}`;
  return group ?? path;
};

const formatTimestamp = (value: number | undefined): string | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value < 1e12 ? value * 1000 : value).toLocaleString();
};

const statusBadgeClass = (status: number | undefined): string => {
  if (typeof status !== "number" || !Number.isFinite(status)) {
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70";
  }
  if (status >= 500) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200";
  }
  if (status >= 400) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70";
};

const neutralBadgeClass =
  "border-slate-200 bg-slate-50 text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70";

const buildDiagnosticBadges = (file: ErrorLogItem, t: Translate) => {
  const status = numberValue(file.status);
  const upstreamStatus = numberValue(file.upstream_status);
  const errorCode = textValue(file.error_code);
  const rejectedBy = textValue(file.rejected_by);
  const provider = textValue(file.provider);
  const model = textValue(file.model);
  const requestID = textValue(file.request_id);
  const items = [
    status
      ? {
          key: "status",
          label: t("logs_page.error_status"),
          value: status,
          className: statusBadgeClass(file.status),
        }
      : undefined,
    errorCode
      ? {
          key: "error_code",
          label: t("logs_page.error_code"),
          value: errorCode,
          className: neutralBadgeClass,
        }
      : undefined,
    rejectedBy
      ? {
          key: "rejected_by",
          label: t("logs_page.rejected_by"),
          value: rejectedBy,
          className: neutralBadgeClass,
        }
      : undefined,
    upstreamStatus
      ? {
          key: "upstream_status",
          label: t("logs_page.upstream_status"),
          value: upstreamStatus,
          className: statusBadgeClass(file.upstream_status),
        }
      : undefined,
    provider
      ? {
          key: "provider",
          label: t("logs_page.provider"),
          value: provider,
          className: neutralBadgeClass,
        }
      : undefined,
    model
      ? {
          key: "model",
          label: t("logs_page.model"),
          value: model,
          className: neutralBadgeClass,
        }
      : undefined,
    requestID
      ? {
          key: "request_id",
          label: t("logs_page.request_id"),
          value: requestID,
          className: neutralBadgeClass,
        }
      : undefined,
  ];
  return items.filter(
    (
      item,
    ): item is {
      key: string;
      label: string;
      value: string;
      className: string;
    } => Boolean(item),
  );
};

function DiagnosticLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="text-slate-500 dark:text-white/45">{label}</span>
      <code className="min-w-0 break-all rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-800 dark:bg-white/5 dark:text-white/75">
        {value}
      </code>
    </div>
  );
}

export function ErrorLogsTab({
  t,
  errorLogsLoading,
  errorLogs,
  requestLogId,
  setRequestLogId,
  handleDownloadRequestLog,
  loadErrorLogs,
  downloadErrorLog,
}: {
  t: Translate;
  errorLogsLoading: boolean;
  errorLogs: ErrorLogItem[];
  requestLogId: string;
  setRequestLogId: Dispatch<SetStateAction<string>>;
  handleDownloadRequestLog: () => Promise<void>;
  loadErrorLogs: () => Promise<void>;
  downloadErrorLog: (file: ErrorLogItem) => Promise<void>;
}) {
  return (
    <Card
      className="md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden"
      bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
      title={t("logs_page.error_logs_title")}
      description={t("logs_page.error_fetch_desc")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadErrorLogs()}
            disabled={errorLogsLoading}
          >
            {t("logs_page.refresh_list")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 md:flex md:min-h-0 md:flex-1 md:flex-col md:space-y-0 md:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:shrink-0 dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("logs_page.request_id_download_title")}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
                {t("logs_page.request_id_download_desc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TextInput
                value={requestLogId}
                onChange={(e) => setRequestLogId(e.currentTarget.value)}
                placeholder={t("logs_page.request_id_placeholder")}
                name="request_log_id"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-44 rounded-xl px-3 py-2 text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleDownloadRequestLog()}
                disabled={requestLogId.trim().length === 0}
              >
                {t("logs_page.download")}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex md:min-h-0 md:flex-1 md:flex-col dark:border-neutral-800 dark:bg-neutral-950/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("logs_page.error_log_files")}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
            {t("logs_page.error_log_list_desc")}
          </p>

          <div className="mt-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
            {errorLogsLoading ? (
              <div className="text-sm text-slate-600 dark:text-white/65">
                {t("logs_page.loading")}
              </div>
            ) : errorLogs.length === 0 ? (
              <EmptyState
                title={t("logs_page.no_error_logs")}
                description={t("logs_page.no_error_desc")}
              />
            ) : (
              <div className="space-y-2">
                {errorLogs.map((file) => {
                  const badges = buildDiagnosticBadges(file, t);
                  const originalUrl = textValue(file.original_url);
                  const effectiveUrl = textValue(file.effective_url);
                  const route = formatRoute(file);
                  const errorType = textValue(file.error_type);
                  const modified = formatTimestamp(file.modified);
                  return (
                    <div
                      key={file.name}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm sm:flex-row sm:items-start sm:justify-between dark:border-neutral-800 dark:bg-neutral-950/60"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-xs text-slate-900 dark:text-white">
                            {file.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                            {typeof file.size === "number"
                              ? t("logs_page.bytes", { size: file.size.toLocaleString() })
                              : "--"}{" "}
                            · {modified ?? "--"}
                          </p>
                        </div>

                        {badges.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {badges.map((badge) => (
                              <span
                                key={badge.key}
                                className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs ${badge.className}`}
                              >
                                <span className="shrink-0 text-current opacity-65">
                                  {badge.label}
                                </span>
                                <span className="min-w-0 truncate font-medium">{badge.value}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="space-y-1.5">
                          {originalUrl ? (
                            <DiagnosticLine
                              label={t("logs_page.original_url")}
                              value={originalUrl}
                            />
                          ) : null}
                          {effectiveUrl && effectiveUrl !== originalUrl ? (
                            <DiagnosticLine
                              label={t("logs_page.effective_url")}
                              value={effectiveUrl}
                            />
                          ) : null}
                          {route ? (
                            <DiagnosticLine label={t("logs_page.route")} value={route} />
                          ) : null}
                          {errorType ? (
                            <DiagnosticLine label={t("logs_page.error_type")} value={errorType} />
                          ) : null}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0 self-start"
                        onClick={() => void downloadErrorLog(file)}
                      >
                        {t("logs_page.download")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
