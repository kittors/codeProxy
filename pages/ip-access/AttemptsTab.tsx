import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ipAccessApi,
  type AuthAttempt,
  type AuthAttemptWindow,
} from "@code-proxy/api-client";
import { Download } from "@code-proxy/ui/icons";
import {
  Button,
  GRID_WIDTH,
  DataGrid,
  DataGridPagination,
  Select,
  TextInput,
  useToast,
  type DataGridColumn,
} from "@code-proxy/ui";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const WINDOW_OPTIONS: AuthAttemptWindow[] = ["1h", "6h", "24h", "7d"];
const OUTCOMES = ["", "failure", "throttled", "blocked", "success", "auto_banned", "would_ban"];
const SURFACES = ["", "admin_login", "portal_login", "management_key", "refresh", "request"];

// 语义色只用淡底 + 同色字；「已拦截 / 已自动封禁」沿用墨色实底和失败的红色区分开（墨色不是装饰色）。
const OUTCOME_TONE: Record<string, string> = {
  failure: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  throttled: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "bg-sn-label text-sn-workspace dark:bg-white/20 dark:text-sn-label",
  auto_banned: "bg-sn-label text-sn-workspace dark:bg-white/20 dark:text-sn-label",
  would_ban: "bg-sn-hover text-sn-label",
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
        setLoadError(null);
      } catch (error) {
        // 读不到时表格显示出错态和「重试」，不是一张看起来「没有记录」的空表。
        setLoadError(error instanceof Error ? error.message : "");
      } finally {
        setLoading(false);
      }
    },
    [ip, outcome, surface, username, window_],
  );

  useEffect(() => {
    void load(1, pageSize);
    // Filter changes always reset to page 1; page navigation calls load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, outcome, surface, username, window_, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filterLabels = [
    ip ? `IP：${ip}` : "",
    username ? `${t("ip_access.col_username")}：${username}` : "",
    surface ? `${t("ip_access.col_surface")}：${t(`ip_access.surface_${surface}`)}` : "",
    outcome ? `${t("ip_access.col_outcome")}：${t(`ip_access.outcome_${outcome}`)}` : "",
  ].filter(Boolean);
  const clearFilters = () => {
    setIp("");
    setUsername("");
    setSurface("");
    setOutcome("");
  };

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

  const columns = useMemo<DataGridColumn<AuthAttempt>[]>(
    () => [
      {
        id: "time",
        header: t("ip_access.col_time"),
        width: GRID_WIDTH.timestamp,
        cell: (item) => new Date(item.occurred_at).toLocaleString(i18n.language),
      },
      {
        id: "ip",
        header: t("ip_access.col_source"),
        width: GRID_WIDTH.name,
        overflowTooltip: true,
        cell: (item) => (
          <span className="font-mono text-sm">
            {item.ip || "—"}
            {item.trusted ? "" : ` (${t("ip_access.untrusted_short")})`}
          </span>
        ),
      },
      {
        id: "outcome",
        header: t("ip_access.col_outcome"),
        width: GRID_WIDTH.compact,
        cell: (item) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              OUTCOME_TONE[item.outcome] ?? "bg-sn-label/[0.05] text-sn-label2 dark:bg-white/[0.07]"
            }`}
          >
            {t(`ip_access.outcome_${item.outcome}`)}
          </span>
        ),
      },
      {
        id: "surface",
        header: t("ip_access.col_surface"),
        width: GRID_WIDTH.compact,
        cell: (item) => t(`ip_access.surface_${item.surface}`, { defaultValue: item.surface }),
      },
      {
        id: "username",
        header: t("ip_access.col_username"),
        width: GRID_WIDTH.name,
        overflowTooltip: true,
        cell: (item) => item.username || "—",
      },
      {
        id: "reason",
        header: t("ip_access.col_reason"),
        width: GRID_WIDTH.composite,
        overflowTooltip: true,
        cell: (item) => (
          <span className="text-sm text-sn-label2">{item.reason || "—"}</span>
        ),
      },
      {
        id: "ua",
        header: t("ip_access.col_user_agent"),
        width: GRID_WIDTH.composite,
        overflowTooltip: true,
        cell: (item) => (
          <span className="text-xs text-sn-label3">{item.user_agent || "—"}</span>
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

      <div className="flex min-h-0 flex-1 flex-col">
        <DataGrid<AuthAttempt>
          fill
          id="ip-access-attempts"
          label={t("ip_access.tab_attempts")}
          rows={items}
          columns={columns}
          rowKey={(item) => String(item.id)}
          loading={loading}
          error={loadError === null ? null : loadError || t("ip_access.load_failed")}
          onRetry={() => void load(page, pageSize)}
          empty={
            filterLabels.length > 0
              ? {
                  title: t("ip_access.no_attempts"),
                  details: (
                    <ul className="flex flex-wrap justify-center gap-1.5">
                      {filterLabels.map((label) => (
                        <li
                          key={label}
                          className="rounded-full bg-sn-label/[0.05] px-2.5 py-1 text-xs text-sn-label2 dark:bg-white/[0.07]"
                        >
                          {label}
                        </li>
                      ))}
                    </ul>
                  ),
                  action: (
                    <Button size="sm" onClick={clearFilters}>
                      {t("common.clear_filters")}
                    </Button>
                  ),
                }
              : { title: t("ip_access.no_attempts") }
          }
          resetScrollKey={`${page}|${pageSize}|${ip}|${username}|${surface}|${outcome}|${window_}`}
          footer={
            <DataGridPagination
              page={page}
              pageSize={pageSize}
              total={total}
              pending={loading && items.length === 0 && total === 0}
              onPageChange={(next) => void load(Math.max(1, Math.min(next, totalPages)), pageSize)}
              onPageSizeChange={(size) => void load(1, size)}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          }
        />
      </div>


    </>
  );
}
