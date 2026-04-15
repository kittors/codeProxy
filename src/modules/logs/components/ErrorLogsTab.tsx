import type { Dispatch, SetStateAction } from "react";
import type { ErrorLogItem } from "@/modules/logs/logsHelpers";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";

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
  t: (key: string, options?: Record<string, unknown>) => string;
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
      title={t("logs_page.error_logs_title")}
      description={t("logs_page.error_fetch_desc")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void loadErrorLogs()} disabled={errorLogsLoading}>
            {t("logs_page.refresh_list")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("logs_page.error_log_files")}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
            {t("logs_page.error_log_list_desc")}
          </p>

          <div className="mt-4">
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
                {errorLogs.map((file) => (
                  <div
                    key={file.name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs text-slate-900 dark:text-white">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                        {typeof file.size === "number"
                          ? t("logs_page.bytes", { size: file.size.toLocaleString() })
                          : "--"}{" "}
                        ·{" "}
                        {typeof file.modified === "number"
                          ? new Date(
                              file.modified < 1e12 ? file.modified * 1000 : file.modified,
                            ).toLocaleString()
                          : "--"}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => void downloadErrorLog(file)}>
                      {t("logs_page.download")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
