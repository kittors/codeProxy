import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Trash2 } from "lucide-react";
import { identityApi, type AuditLogIdentity } from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  ConfirmModal,
  DataTable,
  PaginationBar,
  TABLE_ROW_ACTIONS_COLUMN,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { PermissionGate } from "@app/providers/PermissionGate";
import { AuditLogDetailModal } from "./AuditLogDetailModal";
import { formatActor, formatWhatHappened, resultBadge } from "./auditLogFormat";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function AuditLogsPage() {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  // 有平台审计读权限时，后端的「清空」会删掉所有租户的记录（见 CliRelay ClearAuditLogs），确认框要说清楚。
  const clearsAllTenants = useOptionalAuth()?.can("platform.audit.read") ?? false;
  const [items, setItems] = useState<AuditLogIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detail, setDetail] = useState<AuditLogIdentity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AuditLogIdentity | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  // 正在加载完整记录的那一条：加载中关掉弹窗后，迟到的响应不能把弹窗重新打开。
  const detailRequestRef = useRef<number | null>(null);

  const fetchLogs = useCallback(
    async (page: number, size: number) => {
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      const seq = ++requestSeqRef.current;
      setLoading(true);
      try {
        const response = await identityApi.auditLogs({ page, size });
        if (seq !== requestSeqRef.current || controller.signal.aborted) return;
        setItems(response.items ?? []);
        setTotalCount(response.total ?? 0);
        setCurrentPage(response.page || page);
        setPageSize(response.size || size);
      } catch (error) {
        if (seq !== requestSeqRef.current || controller.signal.aborted) return;
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
        });
      } finally {
        if (requestAbortRef.current === controller) requestAbortRef.current = null;
        if (seq === requestSeqRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [notify, t],
  );

  useEffect(() => {
    void fetchLogs(1, pageSize);
    return () => {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
    };
    // Initial load only; subsequent loads go through pagination handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      void fetchLogs(clamped, pageSize);
    },
    [fetchLogs, pageSize, totalPages],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      void fetchLogs(1, size);
    },
    [fetchLogs],
  );

  const openDetail = useCallback(
    async (item: AuditLogIdentity) => {
      detailRequestRef.current = item.id;
      setDetailLoading(true);
      setDetail(item);
      try {
        const full = await identityApi.auditLog(item.id);
        if (detailRequestRef.current === item.id) setDetail(full);
      } catch (error) {
        if (detailRequestRef.current !== item.id) return;
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
        });
      } finally {
        if (detailRequestRef.current === item.id) setDetailLoading(false);
      }
    },
    [notify, t],
  );

  const closeDetail = useCallback(() => {
    detailRequestRef.current = null;
    setDetail(null);
    setDetailLoading(false);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await identityApi.deleteAuditLog(deleteTarget.id);
      notify({ type: "success", message: t("identity_admin.audit_log_deleted") });
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) closeDetail();
      const nextTotal = Math.max(0, totalCount - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / pageSize));
      const nextPage = Math.min(currentPage, nextTotalPages);
      await fetchLogs(nextPage, pageSize);
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
    } finally {
      setBusy(false);
    }
  }, [closeDetail, currentPage, deleteTarget, detail?.id, fetchLogs, notify, pageSize, t, totalCount]);

  const confirmClearAll = useCallback(async () => {
    setBusy(true);
    try {
      const result = await identityApi.clearAuditLogs();
      notify({
        type: "success",
        message: t("identity_admin.audit_logs_cleared", {
          count: result.deleted ?? 0,
        }),
      });
      setClearAllOpen(false);
      closeDetail();
      await fetchLogs(1, pageSize);
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
    } finally {
      setBusy(false);
    }
  }, [closeDetail, fetchLogs, notify, pageSize, t]);

  const columns = useMemo<DataTableColumn<AuditLogIdentity>[]>(
    () => [
      {
        key: "time",
        label: t("identity_admin.time"),
        width: COLUMN_WIDTH.timestamp,
        render: (item) => new Date(item.created_at).toLocaleString(i18n.language),
      },
      {
        key: "actor",
        label: t("identity_admin.actor"),
        width: COLUMN_WIDTH.nameStacked,
        overflowTooltip: true,
        render: (item) => formatActor(item),
      },
      {
        key: "what",
        label: t("identity_admin.what_happened"),
        overflowTooltip: true,
        render: (item) => formatWhatHappened(item),
      },
      {
        key: "ip",
        label: t("identity_admin.source_ip"),
        width: COLUMN_WIDTH.compact,
        overflowTooltip: true,
        // "Who changed this" is only half an answer without "from where".
        render: (item) =>
          item.ip_address ? (
            <span className="font-mono text-xs text-ink-2">{item.ip_address}</span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        key: "result",
        label: t("identity_admin.result"),
        width: COLUMN_WIDTH.badge,
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (item) => {
          const badge = resultBadge(item.result);
          return (
            <span
              className={`inline-flex min-w-[52px] justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
            >
              {t(badge.labelKey)}
            </span>
          );
        },
      },
      {
        key: "actions",
        label: t("identity_admin.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        render: (item) => (
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              tooltip={t("identity_admin.view")}
              onClick={() => void openDetail(item)}
            >
              <Eye size={15} />
            </Button>
            <PermissionGate permission="tenant.audit.delete">
              <Button
                size="xs"
                variant="ghost-danger"
                disabled={busy}
                tooltip={t("identity_admin.delete")}
                onClick={() => setDeleteTarget(item)}
              >
                <Trash2 size={15} />
              </Button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [busy, i18n.language, openDetail, t],
  );

  return (
    <section data-page-fill="always" className="flex flex-1 flex-col">
      {/* 不再包一层卡片：外壳内容区就是这一页的面板，标题、表格、分页直接落在上面（同请求日志页）。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{t("identity_admin.audit_logs_title")}</h2>
            <p className="text-sm text-ink-3">{t("identity_admin.audit_logs_description")}</p>
          </div>
          <PermissionGate permission="tenant.audit.delete">
            <Button
              variant="secondary-danger"
              size="md"
              onClick={() => setClearAllOpen(true)}
              disabled={busy || loading || totalCount === 0}
              aria-label={t("identity_admin.clear_audit_logs")}
              tooltip={t("identity_admin.clear_audit_logs")}
            >
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </PermissionGate>
        </div>
        {/* 表格吃掉页面剩余高度、内部滚动；不设最小高度保底——页面高度被窗口钉死，保底只会在矮窗口下把表格挤出页面（见请求日志页）。 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <DataTable<AuditLogIdentity>
            tableId="identity-audit-logs"
            rows={items}
            columns={columns}
            rowKey={(item) => String(item.id)}
            loading={loading}
            virtualize={false}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[960px]"
            emptyText={t("identity_admin.no_audit_logs")}
            showAllLoadedMessage={false}
          />
        </div>
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          // 分页条和表格之间靠留白分开，不画分隔线；左右与表格对齐（同请求日志页的 flush）。
          className="pt-3"
          labels={{
            firstPage: t("request_logs.first_page"),
            previousPage: t("request_logs.prev_page"),
            nextPage: t("request_logs.next_page"),
            lastPage: t("request_logs.last_page"),
            rowsPerPage: t("request_logs.rows_per_page"),
            pageInfo: ({ start, end, total }) => t("request_logs.page_info", { start, end, total }),
          }}
        />
      </div>

      <AuditLogDetailModal
        detail={detail}
        loading={detailLoading}
        locale={i18n.language}
        onClose={closeDetail}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("identity_admin.delete_audit_log_title")}
        description={t("identity_admin.delete_lead")}
        subject={
          deleteTarget ? (
            <span className="block min-w-0">
              <span className="block truncate font-medium">{formatWhatHappened(deleteTarget)}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-3">
                {formatActor(deleteTarget)} ·{" "}
                {new Date(deleteTarget.created_at).toLocaleString(i18n.language)}
              </span>
            </span>
          ) : null
        }
        consequences={[t("identity_admin.delete_audit_log_consequence")]}
        confirmText={t("identity_admin.delete_audit_log_button")}
        cancelText={t("common.cancel")}
        variant="danger"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
      />

      {/* 清空审计记录（取证依据）不可恢复，平台管理员清空的还是所有租户的记录：要求输入确认词，
          防止顺手连点。单条删除不加，免得给日常清理添麻烦。 */}
      <ConfirmModal
        open={clearAllOpen}
        title={t("identity_admin.clear_audit_logs_title")}
        description={t("identity_admin.clear_audit_logs_lead")}
        subject={
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate font-medium">
              {t("identity_admin.audit_log_count", { count: totalCount })}
            </span>
            <span className="shrink-0 text-xs text-ink-3">
              {clearsAllTenants
                ? t("identity_admin.audit_scope_all_tenants")
                : t("identity_admin.audit_scope_current_tenant")}
            </span>
          </span>
        }
        consequences={[
          clearsAllTenants
            ? t("identity_admin.clear_audit_logs_consequence_all_tenants")
            : t("identity_admin.clear_audit_logs_consequence_tenant"),
          t("identity_admin.clear_audit_logs_consequence_trace"),
        ]}
        confirmPhrase={t("identity_admin.clear_audit_logs_phrase")}
        confirmText={t("identity_admin.clear_audit_logs_confirm_button")}
        cancelText={t("common.cancel")}
        variant="danger"
        busy={busy}
        onConfirm={() => void confirmClearAll()}
        onClose={() => {
          if (!busy) setClearAllOpen(false);
        }}
      />
    </section>
  );
}
