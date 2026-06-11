import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  proxiesApi,
  type ProxyCheckResult,
  type ProxyPoolEntry,
} from "@code-proxy/api-client/endpoints/proxies";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { HoverTooltip } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
import {
  emptyProxyDraft,
  proxyEndpoint,
  proxyLatencyTone,
  proxyProtocol,
  readCachedProxyCheckState,
  slugifyProxyID,
  validateProxyDraft,
  type ProxyCheckStateEntry,
  writeCachedProxyCheckState,
  type ProxyCheckState,
  type ProxyLatencyTone,
} from "@features/proxy-pool/proxy-utils";

const latencyToneClasses: Record<ProxyLatencyTone, string> = {
  none: "bg-slate-100 text-slate-600 dark:bg-neutral-900 dark:text-slate-300",
  fast: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200",
  slow: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-200",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
};

export function ProxiesPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [entries, setEntries] = useState<ProxyPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState<ProxyPoolEntry>(() => emptyProxyDraft());
  const [editingID, setEditingID] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProxyPoolEntry | null>(null);
  const [checkState, setCheckState] = useState<ProxyCheckState>(() => readCachedProxyCheckState());

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.name.localeCompare(b.name)),
    [entries],
  );

  const storeCheckResult = useCallback((id: string, result: ProxyCheckResult) => {
    setCheckState((prev) => {
      const next = { ...prev, [id]: result };
      writeCachedProxyCheckState(next);
      return next;
    });
  }, []);

  const refreshCheckResults = useCallback(
    async (items: ProxyPoolEntry[]) => {
      if (!items.length) return;

      setCheckState((prev) => {
        const next = { ...prev };
        for (const entry of items) {
          next[entry.id] = { ...next[entry.id], checking: true };
        }
        return next;
      });

      await Promise.all(
        items.map(async (entry) => {
          try {
            const result = await proxiesApi.check({ id: entry.id });
            storeCheckResult(entry.id, result);
          } catch (error) {
            storeCheckResult(entry.id, {
              ok: false,
              message: error instanceof Error ? error.message : t("common.error"),
            });
          }
        }),
      );
    },
    [storeCheckResult, t],
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const nextEntries = await proxiesApi.list();
      setEntries(nextEntries);
      void refreshCheckResults(nextEntries);
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("common.error"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, refreshCheckResults, t]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const closeModal = useCallback(() => {
    setEditingID(null);
    setDraft(emptyProxyDraft());
  }, []);

  const openCreate = useCallback(() => {
    setEditingID("");
    setDraft(emptyProxyDraft());
  }, []);

  const openEdit = useCallback((entry: ProxyPoolEntry) => {
    setEditingID(entry.id);
    setDraft({ ...entry });
  }, []);

  const saveDraft = async () => {
    const invalidField = validateProxyDraft(draft);
    if (invalidField) {
      notify({ type: "error", message: t(`proxies.validation_${invalidField}`) });
      return;
    }

    const normalized: ProxyPoolEntry = {
      ...draft,
      id: draft.id.trim() || slugifyProxyID(draft.name, draft.url),
      name: draft.name.trim(),
      url: draft.url.trim(),
      description: draft.description?.trim() ?? "",
      enabled: draft.enabled,
    };

    setSaving(true);
    try {
      if (editingID) {
        await proxiesApi.update(editingID, {
          name: normalized.name,
          url: normalized.url,
          enabled: normalized.enabled,
          description: normalized.description,
        });
        setEntries((prev) => prev.map((entry) => (entry.id === editingID ? normalized : entry)));
        setCheckState((prev) => {
          const next = { ...prev };
          delete next[editingID];
          writeCachedProxyCheckState(next);
          return next;
        });
        void refreshCheckResults([normalized]);
      } else {
        const nextEntries = [...entries, normalized];
        await proxiesApi.saveAll(nextEntries);
        setEntries(nextEntries);
      }
      notify({ type: "success", message: t("proxies.saved") });
      closeModal();
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("common.error"),
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = useCallback(
    async (id: string) => {
      const nextEntries = entries.filter((entry) => entry.id !== id);
      setDeleting(true);
      try {
        await proxiesApi.saveAll(nextEntries);
        setEntries(nextEntries);
        setCheckState((prev) => {
          const next = { ...prev };
          delete next[id];
          writeCachedProxyCheckState(next);
          return next;
        });
        setDeleteTarget(null);
        notify({ type: "success", message: t("proxies.deleted") });
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("common.error"),
        });
      } finally {
        setDeleting(false);
      }
    },
    [entries, notify, t],
  );

  const checkEntry = useCallback(
    async (entry: ProxyPoolEntry) => {
      await refreshCheckResults([entry]);
    },
    [refreshCheckResults],
  );

  const formatCheckBadgeLabel = useCallback(
    (result?: ProxyCheckStateEntry) => {
      if (!result || typeof result.ok !== "boolean") return "";
      if (result.ok) {
        return typeof result.latencyMs === "number"
          ? `${result.latencyMs} ms`
          : t("proxies.latency_unknown");
      }
      if (typeof result.statusCode === "number" && result.statusCode > 0) {
        return `HTTP ${result.statusCode}`;
      }
      return t("proxies.check_failed");
    },
    [t],
  );

  const formatCheckTooltip = useCallback(
    (result?: ProxyCheckStateEntry) => {
      if (!result || typeof result.ok !== "boolean") return "";

      const lines = [
        `${t("proxies.tooltip_status")}: ${
          result.ok ? t("proxies.check_ok") : t("proxies.check_failed")
        }`,
        `${t("proxies.tooltip_target")}: ${t("proxies.tooltip_target_server")}`,
      ];

      if (typeof result.latencyMs === "number") {
        lines.push(`${t("proxies.tooltip_latency")}: ${result.latencyMs} ms`);
      }
      if (typeof result.statusCode === "number" && result.statusCode > 0) {
        lines.push(`${t("proxies.tooltip_http_status")}: ${result.statusCode}`);
      }
      if (result.message) {
        lines.push(`${t("proxies.tooltip_error")}: ${result.message}`);
      }

      return lines.join("\n");
    },
    [t],
  );

  const columns = useMemo<DataTableColumn<ProxyPoolEntry>[]>(
    () => [
      {
        key: "name",
        label: t("proxies.name"),
        width: "w-44",
        render: (entry) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950 dark:text-white">{entry.name}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-white/50">
              {entry.id}
            </p>
          </div>
        ),
      },
      {
        key: "endpoint",
        label: t("proxies.endpoint_label"),
        width: "w-[180px]",
        render: (entry) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-300">
              {proxyProtocol(entry.url)}
            </span>
            <span className="truncate font-mono text-xs text-slate-700 dark:text-white/70">
              {proxyEndpoint(entry)}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        label: t("proxies.latency"),
        width: "w-40",
        render: (entry) => {
          const result = checkState[entry.id];
          const hasCheckResult = typeof result?.ok === "boolean";
          if (!result || !hasCheckResult) {
            return (
              <span className="text-xs text-slate-500 dark:text-white/45">
                {result?.checking ? t("common.loading_ellipsis") : "--"}
              </span>
            );
          }
          const tone = proxyLatencyTone(result);
          const badgeLabel = formatCheckBadgeLabel(result);
          const tooltipContent = formatCheckTooltip(result);
          return (
            <HoverTooltip
              content={tooltipContent}
              disabled={!tooltipContent}
              className="max-w-full"
            >
              <span
                data-latency-tone={tone}
                className={[
                  "inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  latencyToneClasses[tone],
                ].join(" ")}
              >
                <span className="truncate">{badgeLabel}</span>
              </span>
            </HoverTooltip>
          );
        },
      },
      {
        key: "description",
        label: t("proxies.remark_label"),
        width: "w-[180px]",
        render: (entry) => (
          <p className="truncate text-xs text-slate-600 dark:text-white/60">
            {entry.description || "--"}
          </p>
        ),
      },
      {
        key: "actions",
        label: t("proxies.actions"),
        width: "w-28",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (entry) => {
          const result = checkState[entry.id];
          return (
            <div className="flex justify-end gap-1">
              <Button
                aria-label={t("proxies.check_label", { name: entry.name })}
                title={t("proxies.check_label", { name: entry.name })}
                onClick={() => void checkEntry(entry)}
                disabled={result?.checking}
                size="xs"
              >
                {result?.checking ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
              </Button>
              <Button
                aria-label={t("proxies.edit_label", { name: entry.name })}
                title={t("proxies.edit_label", { name: entry.name })}
                onClick={() => openEdit(entry)}
                size="xs"
              >
                <Pencil size={14} />
              </Button>
              <Button
                aria-label={t("proxies.delete_label", { name: entry.name })}
                title={t("proxies.delete_label", { name: entry.name })}
                onClick={() => setDeleteTarget(entry)}
                variant="ghost"
                size="xs"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          );
        },
      },
    ],
    [checkEntry, checkState, deleteEntry, formatCheckBadgeLabel, formatCheckTooltip, openEdit, t],
  );

  const modalTitle = editingID ? t("proxies.edit_title") : t("proxies.add_title");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {t("proxies.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-white/65">
            {t("proxies.description")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={loadEntries} disabled={loading} size="sm">
            <RefreshCw size={15} />
            {t("common.refresh")}
          </Button>
          <Button onClick={openCreate} variant="primary" size="sm">
            <Plus size={15} />
            {t("proxies.add")}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden" loading={loading && entries.length === 0}>
        <DataTable<ProxyPoolEntry>
          tableId="proxy-pool"
          rows={sortedEntries}
          columns={columns}
          rowKey={(entry) => entry.id}
          rowHeight={56}
          height="h-auto max-h-[70vh]"
          minHeight="min-h-[240px]"
          minWidth="min-w-[960px]"
          caption={t("proxies.table_caption")}
          emptyText={t("proxies.empty_title")}
          showAllLoadedMessage={false}
        />
      </Card>

      <Modal
        open={editingID !== null}
        title={modalTitle}
        maxWidth="max-w-xl"
        onClose={closeModal}
        footer={
          <>
            <Button onClick={closeModal} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void saveDraft()} disabled={saving} variant="primary">
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-white/75">
              {t("proxies.name")}
            </span>
            <TextInput
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-white/75">
              {t("proxies.url")}
            </span>
            <TextInput
              value={draft.url}
              placeholder="socks5://user:pass@127.0.0.1:1080"
              onChange={(event) => setDraft((prev) => ({ ...prev, url: event.target.value }))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-white/75">
              {t("proxies.description_label")}
            </span>
            <TextInput
              value={draft.description ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>
          <ToggleSwitch
            checked={draft.enabled}
            onCheckedChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
            label={t("proxies.enabled")}
          />
        </div>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("proxies.delete_title")}
        description={t("proxies.delete_description", { name: deleteTarget?.name ?? "" })}
        confirmText={t("proxies.delete_confirm")}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteEntry(deleteTarget.id);
        }}
      />
    </div>
  );
}
