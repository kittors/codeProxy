import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import {
  ipAccessApi,
  type IpAccessEffect,
  type IpAccessRule,
} from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  ConfirmModal,
  DataTable,
  PaginationBar,
  Select,
  TABLE_ROW_ACTIONS_COLUMN,
  TextInput,
  ToggleSwitch,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";
import { RuleFormModal } from "./RuleFormModal";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface AccessRulesTabProps {
  /** Pre-filled CIDR handed over from the overview tab's ban/allow shortcuts. */
  pendingRule: { cidr: string; effect: IpAccessEffect } | null;
  onPendingRuleHandled: () => void;
  onRulesChanged: () => void;
}

export function AccessRulesTab({
  pendingRule,
  onPendingRuleHandled,
  onRulesChanged,
}: AccessRulesTabProps) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [items, setItems] = useState<IpAccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [effect, setEffect] = useState<IpAccessEffect | "">("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IpAccessRule | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (nextPage: number, size: number) => {
      setLoading(true);
      try {
        const response = await ipAccessApi.rules({
          effect: effect || undefined,
          search: search || undefined,
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
    [effect, notify, search, t],
  );

  useEffect(() => {
    void load(1, pageSize);
    // Filters reset to the first page; pageSize changes go through the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect, search]);

  useEffect(() => {
    if (pendingRule) setFormOpen(true);
  }, [pendingRule]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleEnabled = useCallback(
    async (rule: IpAccessRule, enabled: boolean) => {
      setBusy(true);
      try {
        await ipAccessApi.updateRule(rule.id, { enabled });
        setItems((prev) => prev.map((row) => (row.id === rule.id ? { ...row, enabled } : row)));
        onRulesChanged();
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("ip_access.save_failed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [notify, onRulesChanged, t],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await ipAccessApi.deleteRule(deleteTarget.id);
      setDeleteTarget(null);
      onRulesChanged();
      await load(page, pageSize);
      notify({ type: "success", message: t("ip_access.rule_deleted") });
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("ip_access.save_failed"),
      });
    } finally {
      setBusy(false);
    }
  }, [deleteTarget, load, notify, onRulesChanged, page, pageSize, t]);

  const columns = useMemo<DataTableColumn<IpAccessRule>[]>(
    () => [
      {
        key: "cidr",
        label: t("ip_access.col_cidr"),
        width: COLUMN_WIDTH.name,
        overflowTooltip: true,
        render: (item) => (
          <span className="font-mono text-sm text-slate-900 dark:text-white">{item.cidr}</span>
        ),
      },
      {
        key: "effect",
        label: t("ip_access.col_effect"),
        width: COLUMN_WIDTH.badge,
        render: (item) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              item.effect === "deny"
                ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            }`}
          >
            {t(`ip_access.effect_${item.effect}`)}
          </span>
        ),
      },
      {
        key: "source",
        label: t("ip_access.col_rule_source"),
        width: COLUMN_WIDTH.badge,
        render: (item) => (
          <span className="text-sm text-slate-600 dark:text-white/70">
            {t(`ip_access.source_${item.source}`)}
          </span>
        ),
      },
      {
        key: "expires",
        label: t("ip_access.col_expires"),
        width: COLUMN_WIDTH.timestamp,
        render: (item) =>
          item.expires_at ? (
            new Date(item.expires_at).toLocaleString(i18n.language)
          ) : (
            <span className="text-slate-400">{t("ip_access.never_expires")}</span>
          ),
      },
      {
        key: "hits",
        label: t("ip_access.col_hits"),
        width: COLUMN_WIDTH.numeric,
        render: (item) => <span className="tabular-nums">{item.hit_count}</span>,
      },
      {
        key: "note",
        label: t("ip_access.col_note"),
        width: COLUMN_WIDTH.composite,
        overflowTooltip: true,
        render: (item) => (
          <span className="text-sm text-slate-600 dark:text-white/70">
            {item.note || item.reason || "—"}
          </span>
        ),
      },
      {
        key: "enabled",
        label: t("ip_access.col_enabled"),
        width: COLUMN_WIDTH.toggle,
        render: (item) => (
          <PermissionGate
            permission="platform.ip_access.write"
            fallback={<span>{item.enabled ? t("common.yes") : t("common.no")}</span>}
          >
            <ToggleSwitch
              checked={item.enabled}
              disabled={busy}
              onCheckedChange={(next) => void toggleEnabled(item, next)}
              ariaLabel={t("ip_access.col_enabled")}
            />
          </PermissionGate>
        ),
      },
      {
        key: "actions",
        label: t("ip_access.col_actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end" as const,
        render: (item) => (
          <PermissionGate permission="platform.ip_access.write">
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              tooltip={t("ip_access.delete_rule")}
              onClick={() => setDeleteTarget(item)}
            >
              <Trash2 size={15} />
            </Button>
          </PermissionGate>
        ),
      },
    ],
    [busy, i18n.language, t, toggleEnabled],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("ip_access.search_placeholder")}
            size="sm"
            className="w-56"
          />
          <Select
            value={effect}
            onChange={(value) => setEffect(value as IpAccessEffect | "")}
            options={[
              { value: "", label: t("ip_access.effect_all") },
              { value: "deny", label: t("ip_access.effect_deny") },
              { value: "allow", label: t("ip_access.effect_allow") },
            ]}
            size="sm"
            className="w-32"
          />
        </div>
        <PermissionGate permission="platform.ip_access.write">
          <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
            <Plus size={15} />
            {t("ip_access.add_rule")}
          </Button>
        </PermissionGate>
      </div>

      <div className="relative min-h-[360px] flex-1 overflow-hidden">
        <DataTable<IpAccessRule>
          tableId="ip-access-rules"
          rows={items}
          columns={columns}
          rowKey={(item) => item.id}
          loading={loading}
          virtualize={false}
          height="h-full"
          minHeight="min-h-full"
          minWidth="min-w-[1040px]"
          emptyText={t("ip_access.no_rules")}
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
        className="border-t border-slate-100 pt-3 dark:border-white/8"
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

      <RuleFormModal
        open={formOpen}
        preset={pendingRule}
        onClose={() => {
          setFormOpen(false);
          onPendingRuleHandled();
        }}
        onCreated={() => {
          setFormOpen(false);
          onPendingRuleHandled();
          onRulesChanged();
          void load(1, pageSize);
        }}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("ip_access.delete_rule")}
        description={t("ip_access.delete_rule_confirm", { cidr: deleteTarget?.cidr ?? "" })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="danger"
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
