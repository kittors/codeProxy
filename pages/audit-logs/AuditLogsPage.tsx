import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Trash2 } from "lucide-react";
import {
  identityApi,
  type AuditLogCallChainStep,
  type AuditLogIdentity,
} from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  DataTable,
  Modal,
  PaginationBar,
  TABLE_ROW_ACTIONS_COLUMN,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function isSuccessResult(result: string): boolean {
  return result === "success";
}

function formatActor(item: AuditLogIdentity): string {
  const user =
    item.actor_display_name?.trim() ||
    item.actor_username?.trim() ||
    item.actor_user_id ||
    item.actor_kind;
  const tenant = item.tenant_name?.trim() || item.tenant_slug?.trim() || item.tenant_id || "—";
  return `${tenant} / ${user}`;
}

function formatWhatHappened(item: AuditLogIdentity): string {
  const resource = item.resource_id
    ? `${item.resource_type} · ${item.resource_id}`
    : item.resource_type;
  return resource || item.action || "—";
}

function asCallChain(value: unknown): AuditLogCallChainStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (step): step is AuditLogCallChainStep => Boolean(step) && typeof step === "object",
  );
}

export function AuditLogsPage() {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
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
      setDetailLoading(true);
      setDetail(item);
      try {
        const full = await identityApi.auditLog(item.id);
        setDetail(full);
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [notify, t],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await identityApi.deleteAuditLog(deleteTarget.id);
      notify({ type: "success", message: t("identity_admin.audit_log_deleted") });
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
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
  }, [currentPage, deleteTarget, detail?.id, fetchLogs, notify, pageSize, t, totalCount]);

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
      setDetail(null);
      await fetchLogs(1, pageSize);
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
    } finally {
      setBusy(false);
    }
  }, [fetchLogs, notify, pageSize, t]);

  const columns = useMemo<DataTableColumn<AuditLogIdentity>[]>(
    () => [
      {
        key: "time",
        label: t("identity_admin.time"),
        width: "w-52",
        render: (item) => new Date(item.created_at).toLocaleString(i18n.language),
      },
      {
        key: "actor",
        label: t("identity_admin.actor"),
        width: "w-72",
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
        key: "result",
        label: t("identity_admin.result"),
        width: "w-28",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (item) =>
          isSuccessResult(item.result) ? (
            <span className="inline-flex min-w-[52px] justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              {t("identity_admin.result_success")}
            </span>
          ) : (
            <span className="inline-flex min-w-[52px] justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              {t("identity_admin.result_failed")}
            </span>
          ),
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
                variant="ghost"
                className="text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
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

  const callChain = asCallChain(detail?.changes?.call_chain);
  const projectMethod = detail?.changes?.project_method;

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {t("identity_admin.audit_logs_title")}
            </h2>
            <p className="text-sm text-slate-500">{t("identity_admin.audit_logs_description")}</p>
          </div>
          <PermissionGate permission="tenant.audit.delete">
            <button
              type="button"
              onClick={() => setClearAllOpen(true)}
              disabled={busy || loading || totalCount === 0}
              aria-label={t("identity_admin.clear_audit_logs")}
              title={t("identity_admin.clear_audit_logs")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </PermissionGate>
        </div>
        <div className="relative h-[calc(100dvh-300px)] min-h-[360px] overflow-hidden px-5">
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
          className="border-t border-slate-100 px-3 py-3 sm:px-5 dark:border-neutral-800/60"
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

      <Modal
        open={detail !== null}
        title={t("identity_admin.audit_log_detail_title")}
        maxWidth="max-w-3xl"
        onClose={() => {
          if (!detailLoading) setDetail(null);
        }}
      >
        {detail ? (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField
                label={t("identity_admin.time")}
                value={new Date(detail.created_at).toLocaleString(i18n.language)}
              />
              <DetailField label={t("identity_admin.actor")} value={formatActor(detail)} />
              <DetailField
                label={t("identity_admin.what_happened")}
                value={formatWhatHappened(detail)}
              />
              <DetailField
                label={t("identity_admin.result")}
                value={
                  isSuccessResult(detail.result)
                    ? t("identity_admin.result_success")
                    : t("identity_admin.result_failed")
                }
              />
              <DetailField
                label={t("identity_admin.request_id")}
                value={detail.request_id || "—"}
              />
              <DetailField
                label={t("identity_admin.resource")}
                value={
                  detail.resource_id
                    ? `${detail.resource_type} · ${detail.resource_id}`
                    : detail.resource_type
                }
              />
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                {t("identity_admin.call_chain")}
              </h3>
              {detailLoading ? (
                <p className="text-slate-500">{t("identity_admin.loading")}</p>
              ) : callChain.length === 0 ? (
                <p className="text-slate-500">{t("identity_admin.no_call_chain")}</p>
              ) : (
                <ol className="space-y-2">
                  {callChain.map((step, index) => (
                    <li
                      key={`${step.step ?? index}-${step.name ?? "step"}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/70"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-2xs font-semibold text-slate-700 dark:bg-neutral-700 dark:text-white/80">
                          {step.step ?? index + 1}
                        </span>
                        {step.layer ? (
                          <span className="rounded-md bg-white px-1.5 py-0.5 text-2xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950 dark:text-white/70 dark:ring-neutral-700">
                            {step.layer}
                          </span>
                        ) : null}
                        <span className="font-medium text-slate-900 dark:text-white">
                          {step.name || "—"}
                        </span>
                      </div>
                      {step.detail || step.package || step.resource ? (
                        <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                          {[
                            step.detail,
                            step.package,
                            step.resource
                              ? `${step.resource}${step.resource_id ? ` · ${step.resource_id}` : ""}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                {t("identity_admin.project_method")}
              </h3>
              {detailLoading ? (
                <p className="text-slate-500">{t("identity_admin.loading")}</p>
              ) : projectMethod ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-white/75">
                  <div>
                    {[projectMethod.package, projectMethod.handler || projectMethod.method]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                  {projectMethod.route || projectMethod.resource ? (
                    <div className="mt-1 text-slate-500 dark:text-white/50">
                      {[projectMethod.route, projectMethod.resource].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-slate-500">{t("identity_admin.no_project_method")}</p>
              )}
            </section>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("identity_admin.delete")}
        description={t("identity_admin.delete_audit_log_confirm")}
        confirmText={t("identity_admin.delete")}
        cancelText={t("common.cancel")}
        variant="danger"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
      />

      <ConfirmModal
        open={clearAllOpen}
        title={t("identity_admin.clear_audit_logs")}
        description={t("identity_admin.clear_audit_logs_confirm")}
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-slate-500 dark:text-white/50">{label}</div>
      <div className="mt-0.5 break-all text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}
