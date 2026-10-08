import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ipAccessApi,
  type AuthAttempt,
  type AuthAttemptWindow,
} from "@code-proxy/api-client";
import { Download } from "lucide-react";
import {
  Button,
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
const SURFACES = ["", "admin_login", "portal_login", "management_key", "refresh", "request"];

// 语义色只用淡底 + 同色字；「已拦截 / 已自动封禁」沿用墨色实底和失败的红色区分开（墨色不是装饰色）。
const OUTCOME_TONE: Record<string, string> = {
  failure: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  throttled: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "bg-ink text-canvas dark:bg-white/20 dark:text-ink",
  auto_banned: "bg-ink text-canvas dark:bg-white/20 dark:text-ink",
  would_ban: "bg-hover text-ink",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
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
  const [username, setUsername] = useState("");
  const [surface, setSurface] = useState("");
  const [window_, setWindow] = useState<AuthAttemptWindow>("24h");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setIp(ipFilter);
  }, [ipFilter]);

  const load = useCallback(
    async (nextPage: number, size: number) => {
      setLoading(true);
      try {
        const response = await ipAccessApi.attempts({
          ip: ip || undefined,
          username: username || undefined,
          surface: surface || undefined,
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
    [ip, notify, outcome, surface, t, username, window_],
  );

  useEffect(() => {
    void load(1, pageSize);
    // Filter changes always reset to page 1; page navigation calls load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, outcome, surface, username, window_, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // The export mirrors the active filters: exporting something other than what
  // is on screen is the kind of surprise that makes an export untrustworthy.
  const exportAttempts = useCallback(async () => {
    setExporting(true);
    try {
      await ipAccessApi.exportAttempts({
        ip: ip || undefined,
        username: username || undefined,
        surface: surface || undefined,
        outcome: outcome || undefined,
        window: window_,
      });
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("ip_access.export_failed"),
      });
    } finally {
      setExporting(false);
    }
  }, [ip, notify, outcome, surface, t, username, window_]);

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
              OUTCOME_TONE[item.outcome] ?? "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]"
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
          <span className="text-sm text-ink-2">{item.reason || "—"}</span>
        ),
      },
      {
        key: "ua",
        label: t("ip_access.col_user_agent"),
        width: COLUMN_WIDTH.composite,
        overflowTooltip: true,
        render: (item) => (
          <span className="text-xs text-ink-3">{item.user_agent || "—"}</span>
        ),
      },
    ],
    [i18n.language, t],
  );

  return (
    <>
      <div className="pb-3">
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
          <div className="w-full min-[480px]:w-auto sm:w-[180px]">
            <TextInput
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("ip_access.filter_username_placeholder")}
              size="sm"
            />
          </div>
          <div className="w-full min-[480px]:w-auto sm:w-[160px]">
            <Select
              value={surface}
              onChange={setSurface}
              options={SURFACES.map((value) => ({
                value,
                label: value ? t(`ip_access.surface_${value}`) : t("ip_access.surface_all"),
              }))}
              size="sm"
              fullWidth
              aria-label={t("ip_access.col_surface")}
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
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() => void exportAttempts()}
            disabled={exporting}
            aria-busy={exporting}
            aria-label={t("ip_access.export_csv")}
            title={t("ip_access.export_csv")}
          >
            <Download size={15} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
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
        // 分页条和表格之间靠留白分开，不画分隔线（同请求日志页）。
        className="pt-3"
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
