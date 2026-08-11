import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  ipAccessApi,
  type IpAccessEffect,
  type IpAccessRule,
  type IpAccessSource,
  type ProtectedEntry,
} from "@code-proxy/api-client";
import {
  Button,
  Checkbox,
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
import { RuleEditModal } from "./RuleEditModal";
import { RuleFormModal } from "./RuleFormModal";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface AccessRulesTabProps {
  /** Pre-filled CIDR handed over from the overview tab's ban/allow shortcuts. */
  pendingRule: { cidr: string; effect: IpAccessEffect } | null;
  onPendingRuleHandled: () => void;
  onRulesChanged: () => void;
  refreshToken: number;
  protectedEntries: ProtectedEntry[];
}

export function AccessRulesTab({
  pendingRule,
  onPendingRuleHandled,
  onRulesChanged,
  refreshToken,
  protectedEntries,
}: AccessRulesTabProps) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [items, setItems] = useState<IpAccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [effect, setEffect] = useState<IpAccessEffect | "">("");
  const [source, setSource] = useState<IpAccessSource | "">("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editTarget, setEditTarget] = useState<IpAccessRule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IpAccessRule | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (nextPage: number, size: number) => {
      setLoading(true);
      try {
        const response = await ipAccessApi.rules({
          effect: effect || undefined,
          source: source || undefined,
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
    [effect, notify, search, source, t],
  );

  useEffect(() => {
    void load(1, pageSize);
    // Filters reset to the first page; pageSize changes go through the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setSelected([]);
  }, [effect, source, search, refreshToken]);

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

  const bulkApply = useCallback(
    async (body: { enabled?: boolean; delete?: boolean }) => {
      if (selected.length === 0) return;
      setBusy(true);
      try {
        const result = await ipAccessApi.bulkUpdateRules({ ids: selected, ...body });
        const failedCount = Object.keys(result.failed ?? {}).length;
        // Partial success is reported rather than swallowed: a rule another
        // operator just deleted must not look like the whole batch worked.
        notify({
          type: failedCount > 0 ? "warning" : "success",
          message:
            failedCount > 0
              ? t("ip_access.bulk_partial", { applied: result.applied.length, failed: failedCount })
              : t("ip_access.bulk_done", { count: result.applied.length }),
        });
        setSelected([]);
        onRulesChanged();
        await load(page, pageSize);
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("ip_access.save_failed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [load, notify, onRulesChanged, page, pageSize, selected, t],
  );

  // Releasing a ban usually means "this one was wrong", and the next thing an
  // operator wants is for it not to happen again — so the two steps are one action.
  const unbanAndAllow = useCallback(
    async (rule: IpAccessRule) => {
      setBusy(true);
      try {
        await ipAccessApi.deleteRule(rule.id);
        await ipAccessApi.createRule({
          cidr: rule.cidr,
          effect: "allow",
          note: t("ip_access.unban_note"),
        });
        notify({ type: "success", message: t("ip_access.unban_done", { cidr: rule.cidr }) });
        onRulesChanged();
        await load(page, pageSize);
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("ip_access.save_failed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [load, notify, onRulesChanged, page, pageSize, t],
  );

  const allSelected = items.length > 0 && selected.length === items.length;

  const columns = useMemo<DataTableColumn<IpAccessRule>[]>(
    () => [
      {
        key: "select",
        label: "",
        width: COLUMN_WIDTH.checkbox,
        resizable: false,
        headerRender: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onCheckedChange={(next) => setSelected(next ? items.map((row) => row.id) : [])}
            aria-label={t("ip_access.select_all")}
          />
        ),
        render: (item) => (
          <Checkbox
            checked={selected.includes(item.id)}
            onCheckedChange={(next) =>
              setSelected((prev) =>
                next ? [...prev, item.id] : prev.filter((id) => id !== item.id),
              )
            }
            aria-label={t("ip_access.select_rule", { cidr: item.cidr })}
          />
        ),
      },
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
        width: COLUMN_WIDTH.compact,
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
        width: COLUMN_WIDTH.compact,
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
        width: COLUMN_WIDTH.numericWide,
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
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                tooltip={t("ip_access.edit_rule")}
                onClick={() => setEditTarget(item)}
              >
                <Pencil size={15} />
              </Button>
              {item.effect === "deny" ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  tooltip={t("ip_access.unban_and_allow")}
                  onClick={() => void unbanAndAllow(item)}
                >
                  <ShieldCheck size={15} />
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                tooltip={t("ip_access.delete_rule")}
                onClick={() => setDeleteTarget(item)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </PermissionGate>
        ),
      },
    ],
    [allSelected, busy, i18n.language, items, selected, t, toggleEnabled, unbanAndAllow],
  );

  return (
    <>
      <div className="border-t border-slate-100 px-5 py-3 dark:border-white/8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full min-[480px]:w-auto sm:w-[220px]">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ip_access.search_placeholder")}
              size="sm"
            />
          </div>
          <div className="w-full min-[480px]:w-auto sm:w-[140px]">
            <Select
              value={effect}
              onChange={(value) => setEffect(value as IpAccessEffect | "")}
              options={[
                { value: "", label: t("ip_access.effect_all") },
                { value: "deny", label: t("ip_access.effect_deny") },
                { value: "allow", label: t("ip_access.effect_allow") },
              ]}
              size="sm"
              fullWidth
              aria-label={t("ip_access.col_effect")}
            />
          </div>
          <div className="w-full min-[480px]:w-auto sm:w-[140px]">
            <Select
              value={source}
              onChange={(value) => setSource(value as IpAccessSource | "")}
              options={[
                { value: "", label: t("ip_access.source_all") },
                { value: "manual", label: t("ip_access.source_manual") },
                { value: "auto", label: t("ip_access.source_auto") },
              ]}
              size="sm"
              fullWidth
              aria-label={t("ip_access.col_rule_source")}
            />
          </div>
          {selected.length > 0 ? (
            <PermissionGate permission="platform.ip_access.write">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-white/50">
                  {t("ip_access.selected_count", { count: selected.length })}
                </span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void bulkApply({ enabled: false })}>
                  {t("ip_access.bulk_disable")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void bulkApply({ enabled: true })}>
                  {t("ip_access.bulk_enable")}
                </Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void bulkApply({ delete: true })}>
                  {t("ip_access.bulk_delete")}
                </Button>
              </div>
            </PermissionGate>
          ) : null}
          <PermissionGate permission="platform.ip_access.write">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              aria-label={t("ip_access.add_rule")}
              title={t("ip_access.add_rule")}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
            >
              <Plus size={15} aria-hidden="true" />
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-5">
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

      {protectedEntries.length > 0 ? (
        <div className="border-t border-slate-100 px-5 py-3 dark:border-white/8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-xs font-medium text-slate-700 dark:text-white/80">
              {t("ip_access.protected_title")}
            </span>
            {protectedEntries.map((entry) => (
              <span
                key={entry.cidr}
                title={t(`ip_access.protected_${entry.reason}`)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-white/10 dark:text-white/70"
              >
                {entry.cidr}
              </span>
            ))}
            <span className="text-xs text-slate-500 dark:text-white/50">
              {t("ip_access.protected_hint")}
            </span>
          </div>
        </div>
      ) : null}

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

      <RuleEditModal
        rule={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          onRulesChanged();
          void load(page, pageSize);
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
    </>
  );
}
