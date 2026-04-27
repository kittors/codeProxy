import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Pencil, Plus, RefreshCw, Trash2, Network } from "lucide-react";
import { proxiesApi, type ProxyCheckResult, type ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  emptyProxyDraft,
  proxyDisplayURL,
  proxyProtocol,
  slugifyProxyID,
  validateProxyDraft,
} from "@/modules/proxies/proxy-utils";

type CheckState = Record<string, ProxyCheckResult & { checking?: boolean }>;

export function ProxiesPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [entries, setEntries] = useState<ProxyPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProxyPoolEntry>(() => emptyProxyDraft());
  const [editingID, setEditingID] = useState<string | null>(null);
  const [checkState, setCheckState] = useState<CheckState>({});

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.name.localeCompare(b.name)),
    [entries],
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await proxiesApi.list());
    } catch (error) {
      notify({ type: "error", message: error instanceof Error ? error.message : t("common.error") });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const closeModal = () => {
    setEditingID(null);
    setDraft(emptyProxyDraft());
  };

  const openCreate = () => {
    setEditingID("");
    setDraft(emptyProxyDraft());
  };

  const openEdit = (entry: ProxyPoolEntry) => {
    setEditingID(entry.id);
    setDraft({ ...entry });
  };

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
    const nextEntries =
      editingID && entries.some((entry) => entry.id === editingID)
        ? entries.map((entry) => (entry.id === editingID ? normalized : entry))
        : [...entries, normalized];

    setSaving(true);
    try {
      await proxiesApi.saveAll(nextEntries);
      setEntries(nextEntries);
      notify({ type: "success", message: t("proxies.saved") });
      closeModal();
    } catch (error) {
      notify({ type: "error", message: error instanceof Error ? error.message : t("common.error") });
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    const nextEntries = entries.filter((entry) => entry.id !== id);
    try {
      await proxiesApi.saveAll(nextEntries);
      setEntries(nextEntries);
      notify({ type: "success", message: t("proxies.deleted") });
    } catch (error) {
      notify({ type: "error", message: error instanceof Error ? error.message : t("common.error") });
    }
  };

  const checkEntry = async (entry: ProxyPoolEntry) => {
    setCheckState((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], checking: true } }));
    try {
      const result = await proxiesApi.check({ id: entry.id });
      setCheckState((prev) => ({ ...prev, [entry.id]: result }));
    } catch (error) {
      setCheckState((prev) => ({
        ...prev,
        [entry.id]: {
          ok: false,
          message: error instanceof Error ? error.message : t("common.error"),
        },
      }));
    }
  };

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

      {sortedEntries.length === 0 && !loading ? (
        <EmptyState
          icon={<Network size={24} />}
          title={t("proxies.empty_title")}
          description={t("proxies.empty_desc")}
          action={
            <Button onClick={openCreate} variant="primary" size="sm">
              <Plus size={15} />
              {t("proxies.add")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {sortedEntries.map((entry) => {
            const result = checkState[entry.id];
            return (
              <Card key={entry.id} padding="compact" loading={loading}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-300">
                        {proxyProtocol(entry.url)}
                      </span>
                      <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                        {entry.name}
                      </h3>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          entry.enabled
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 dark:bg-neutral-900 dark:text-slate-400",
                        ].join(" ")}
                      >
                        {entry.enabled ? t("proxies.enabled") : t("proxies.disabled")}
                      </span>
                    </div>
                    <p className="truncate font-mono text-xs text-slate-600 dark:text-white/65">
                      {proxyDisplayURL(entry)}
                    </p>
                    {entry.description ? (
                      <p className="text-xs text-slate-500 dark:text-white/55">
                        {entry.description}
                      </p>
                    ) : null}
                    {result && !result.checking ? (
                      <p
                        className={[
                          "text-xs font-medium",
                          result.ok
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-rose-600 dark:text-rose-300",
                        ].join(" ")}
                      >
                        {result.ok ? t("proxies.check_ok") : t("proxies.check_failed")}
                        {result.statusCode ? ` · ${result.statusCode}` : ""}
                        {typeof result.latencyMs === "number" ? ` · ${result.latencyMs} ms` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={t("proxies.check_label", { name: entry.name })}
                      title={t("proxies.check_label", { name: entry.name })}
                      onClick={() => void checkEntry(entry)}
                      disabled={result?.checking}
                      size="xs"
                    >
                      {result?.checking ? <RefreshCw size={14} /> : <CheckCircle2 size={14} />}
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
                      onClick={() => void deleteEntry(entry.id)}
                      variant="ghost"
                      size="xs"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
    </div>
  );
}

