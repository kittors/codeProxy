import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ipAccessApi,
  type AuthAttempt,
  type AuthAttemptWindow,
} from "@code-proxy/api-client";
import {
  COLUMN_WIDTH,
  DataTable,
  PaginationBar,
  Select,
  TextInput,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const WINDOW_OPTIONS: AuthAttemptWindow[] = ["1h", "6h", "24h", "7d"];
const OUTCOMES = ["", "failure", "throttled", "blocked", "success", "auto_banned", "would_ban"];

const OUTCOME_TONE: Record<string, string> = {
  failure: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  throttled: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  blocked: "bg-slate-800 text-white dark:bg-white/20",
  auto_banned: "bg-slate-800 text-white dark:bg-white/20",
  would_ban: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export function AttemptsTab({
  ipFilter,
  refreshToken,
}: {
  ipFilter: string;
  refreshToken: number;
}) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [items, setItems] = useState<AuthAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [ip, setIp] = useState(ipFilter);
  const [outcome, setOutcome] = useState("");
  const [window_, setWindow] = useState<AuthAttemptWindow>("24h");

  useEffect(() => {
    setIp(ipFilter);
  }, [ipFilter]);

  const load = useCallback(
    async (nextPage: number, size: number) => {
      setLoading(true);
      try {
        const response = await ipAccessApi.attempts({
          ip: ip || undefined,
          outcome: outcome || undefined,
          window: window_,
          page: nextPage,
          size,
        });
        setItems(response.items ?? []);
        setTotal(response.total ?? 0);
        setPage(response.page || nextPage);
        setPageSize(response.size || size);
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("ip_access.load_failed"),
        });
      } finally {
        setLoading(false);
      }
    },
    [ip, notify, outcome, t, window_],
  );

  useEffect(() => {
    void load(1, pageSize);
    // Filter changes always reset to page 1; page navigation calls load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, outcome, window_, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<DataTableColumn<AuthAttempt>[]>(
    () => [
      {
        key: "time",
        label: t("ip_access.col_time"),
        width: COLUMN_WIDTH.timestamp,
        render: (item) => new Date(item.occurred_at).toLocaleString(i18n.language),
      },
      {
        key: "ip",
        label: t("ip_access.col_source"),
        width: COLUMN_WIDTH.name,
        overflowTooltip: true,
        render: (item) => (
          <span className="font-mono text-sm">
            {item.ip || "—"}
            {item.trusted ? "" : ` (${t("ip_access.untrusted_short")})`}
          </span>
        ),
      },
      {
        key: "outcome",
        label: t("ip_access.col_outcome"),
        width: COLUMN_WIDTH.compact,
        render: (item) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              OUTCOME_TONE[item.outcome] ?? "bg-slate-100 text-slate-600 dark:bg-white/10"
            }`}
          >
            {t(`ip_access.outcome_${item.outcome}`)}
          </span>
        ),
      },
      {
        key: "surface",
        label: t("ip_access.col_surface"),
        width: COLUMN_WIDTH.compact,
        render: (item) => t(`ip_access.surface_${item.surface}`, { defaultValue: item.surface }),
      },
      {
        key: "username",
        label: t("ip_access.col_username"),
        width: COLUMN_WIDTH.name,
        overflowTooltip: true,
        render: (item) => item.username || "—",
      },
      {
        key: "reason",
        label: t("ip_access.col_reason"),
        width: COLUMN_WIDTH.composite,
        overflowTooltip: true,
        render: (item) => (
          <span className="text-sm text-slate-600 dark:text-white/70">{item.reason || "—"}</span>
        ),
      },
      {
        key: "ua",
        label: t("ip_access.col_user_agent"),
        width: COLUMN_WIDTH.composite,
        overflowTooltip: true,
        render: (item) => (
          <span className="text-xs text-slate-500">{item.user_agent || "—"}</span>
        ),
      },
    ],
    [i18n.language, t],
  );

  return (
    <>
      <div className="border-t border-slate-100 px-5 py-3 dark:border-white/8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full min-[480px]:w-auto sm:w-[220px]">
            <TextInput
              value={ip}
              onChange={(event) => setIp(event.target.value)}
              placeholder={t("ip_access.filter_ip_placeholder")}
              size="sm"
              className="font-mono"
            />
          </div>
          <div className="w-full min-[480px]:w-auto sm:w-[160px]">
            <Select
              value={outcome}
              onChange={setOutcome}
              options={OUTCOMES.map((value) => ({
                value,
                label: value ? t(`ip_access.outcome_${value}`) : t("ip_access.outcome_all"),
              }))}
              size="sm"
              fullWidth
              aria-label={t("ip_access.col_outcome")}
            />
          </div>
          <div className="w-full min-[480px]:w-auto sm:w-[140px]">
            <Select
              value={window_}
              onChange={(value) => setWindow(value as AuthAttemptWindow)}
              options={WINDOW_OPTIONS.map((value) => ({
                value,
                label: t(`ip_access.window_${value}`),
              }))}
              size="sm"
              fullWidth
              aria-label={t("ip_access.filter_window")}
            />
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-5">
        <DataTable<AuthAttempt>
          tableId="ip-access-attempts"
          rows={items}
          columns={columns}
          rowKey={(item) => String(item.id)}
          loading={loading}
          virtualize={false}
          height="h-full"
          minHeight="min-h-full"
          minWidth="min-w-[1100px]"
          emptyText={t("ip_access.no_attempts")}
          showAllLoadedMessage={false}
        />
      </div>

      <PaginationBar
        currentPage={page}
        totalPages={totalPages}
        totalCount={total}
        pageSize={pageSize}
        onPageChange={(next) => void load(Math.max(1, Math.min(next, totalPages)), pageSize)}
        onPageSizeChange={(size) => void load(1, size)}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        className="border-t border-slate-100 px-3 py-3 sm:px-5 dark:border-white/8"
        labels={{
          firstPage: t("request_logs.first_page"),
          previousPage: t("request_logs.prev_page"),
          nextPage: t("request_logs.next_page"),
          lastPage: t("request_logs.last_page"),
          rowsPerPage: t("request_logs.rows_per_page"),
          pageInfo: ({ start, end, total: count }) =>
            t("request_logs.page_info", { start, end, total: count }),
        }}
      />
    </>
  );
}
