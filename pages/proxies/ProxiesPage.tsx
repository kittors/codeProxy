import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, CheckCircle2, Pencil, Plus, RefreshCw, Share2, Trash2 } from "lucide-react";
import {
  NO_SHARING_CAPABILITY,
  type ResourceSharingCapability,
} from "@code-proxy/api-client/endpoints/resource-sharing";
import {
  proxiesApi,
  proxyIdKey,
  type ProxyCheckResult,
  type ProxyPoolEntry,
  type SharedProxyEntry,
} from "@code-proxy/api-client/endpoints/proxies";
import { Button, Callout, COLUMN_WIDTH } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { DataTable, TABLE_ROW_ACTIONS_COLUMN, type DataTableColumn } from "@code-proxy/ui";
import {
  emptyProxyDraft,
  proxyEndpoint,
  proxyProtocol,
  readCachedProxyCheckState,
  slugifyProxyID,
  uniqueProxyID,
  validateProxyDraft,
  writeCachedProxyCheckState,
  type ProxyCheckState,
} from "@features/proxy-pool/proxy-utils";
import { SharingNoticeBadge } from "@features/resource-sharing";
import { ProxyFormModal, type ProxyFormField } from "./ProxyFormModal";
import { ProxyLatencyCell } from "./ProxyLatencyCell";
import { ProxySharingCell } from "./ProxySharingCell";
import { ProxySharingDialogs } from "./ProxySharingDialogs";
import { SharedProxiesSection } from "./SharedProxiesSection";
import { useProxySharing } from "./useProxySharing";

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
  const [formError, setFormError] = useState<ProxyFormField | null>(null);
  const [checkState, setCheckState] = useState<ProxyCheckState>(() => readCachedProxyCheckState());
  // 平台共享（租户视角）：只读的共享代理，以及自有代理里覆盖了共享条目、可以改用共享版本的那条。
  const [sharedEntries, setSharedEntries] = useState<SharedProxyEntry[]>([]);
  const [sharingCapability, setSharingCapability] =
    useState<ResourceSharingCapability>(NO_SHARING_CAPABILITY);
  const [switchTarget, setSwitchTarget] = useState<ProxyPoolEntry | null>(null);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.name.localeCompare(b.name)),
    [entries],
  );
  const overriddenSharedKeys = useMemo(
    () =>
      new Set(sharedEntries.filter((entry) => entry.overridden).map((entry) => proxyIdKey(entry.id))),
    [sharedEntries],
  );

  const storeCheckResult = useCallback((id: string, result: ProxyCheckResult) => {
    setCheckState((prev) => {
      const next = { ...prev, [id]: result };
      writeCachedProxyCheckState(next);
      return next;
    });
  }, []);

  // 按 ID 在服务端检测：自有代理和平台共享代理都一样（共享代理的地址不下发到面板）。
  const refreshCheckResults = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;

      setCheckState((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          next[id] = { ...next[id], checking: true };
        }
        return next;
      });

      await Promise.all(
        ids.map(async (id) => {
          try {
            const result = await proxiesApi.check({ id });
            storeCheckResult(id, result);
          } catch (error) {
            storeCheckResult(id, {
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
      const listing = await proxiesApi.listWithSharing();
      setEntries(listing.items);
      setSharedEntries(listing.sharedItems);
      setSharingCapability(listing.sharing);
      // 被本租户同 ID 代理覆盖的共享条目不测：按 ID 检测测到的会是自有那条。
      void refreshCheckResults([
        ...listing.items.map((entry) => entry.id),
        ...listing.sharedItems.filter((entry) => !entry.overridden).map((entry) => entry.id),
      ]);
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
    setFormError(null);
  }, []);

  const openCreate = useCallback(() => {
    setEditingID("");
    setDraft(emptyProxyDraft());
    setFormError(null);
  }, []);

  const openEdit = useCallback((entry: ProxyPoolEntry) => {
    setEditingID(entry.id);
    setDraft({ ...entry });
    setFormError(null);
  }, []);

  const saveDraft = async () => {
    const invalidField = validateProxyDraft(draft);
    if (invalidField) {
      // 错误就地标在对应输入框下（ProxyFormModal），不再只弹 toast。
      setFormError(invalidField === "name" ? "name" : "url");
      return;
    }

    const baseID = draft.id.trim() || slugifyProxyID(draft.name, draft.url);
    const normalized: ProxyPoolEntry = {
      ...draft,
      id: editingID ? editingID : uniqueProxyID(baseID, entries, editingID),
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
        void refreshCheckResults([normalized.id]);
      } else {
        // 整表替换只提交自有条目：平台共享的代理不在 entries 里，混进来就会被复制成本租户的一份。
        const nextEntries = [...entries, normalized];
        await proxiesApi.saveAll(nextEntries);
        setEntries(nextEntries);
        void refreshCheckResults([normalized.id]);
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

  // 从本租户的代理池里删掉一条自有代理（整表替换，只提交自有条目）。成功返回 true，失败时
  // 弹窗保持打开。删除和「改用平台共享」都走这里，区别只在提示文案。
  const removeOwnEntry = useCallback(
    async (id: string, successMessage: string) => {
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
        notify({ type: "success", message: successMessage });
        return true;
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("common.error"),
        });
        return false;
      } finally {
        setDeleting(false);
      }
    },
    [entries, notify, t],
  );

  const checkEntry = useCallback(
    async (entry: { id: string }) => {
      await refreshCheckResults([entry.id]);
    },
    [refreshCheckResults],
  );
  const checkSharedEntry = useCallback(
    (entry: SharedProxyEntry) => void checkEntry(entry),
    [checkEntry],
  );

  const proxySharing = useProxySharing({ capability: sharingCapability, reload: loadEntries });
  const { manageable: sharingManageable, openAdopt, openSharing } = proxySharing;
  const sharingTenantNames = proxySharing.tenants.names;
  // 只有系统租户的条目会带共享信息；非平台管理员也能看到共享状态，但没有任何编辑入口。
  const showSharingColumn =
    sharingCapability.supported &&
    (sharingManageable || entries.some((entry) => entry.sharing || entry.overriddenBy));
  const switchSharedEntry = switchTarget
    ? sharedEntries.find((entry) => proxyIdKey(entry.id) === proxyIdKey(switchTarget.id))
    : undefined;
  const switchBlocked = switchSharedEntry ? !switchSharedEntry.enabled : false;

  const columns = useMemo<DataTableColumn<ProxyPoolEntry>[]>(
    () => [
      {
        key: "name",
        label: t("proxies.name"),
        width: COLUMN_WIDTH.badgeGroup,
        render: (entry) => (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate font-semibold text-ink">{entry.name}</p>
              {overriddenSharedKeys.has(proxyIdKey(entry.id)) ? (
                <SharingNoticeBadge
                  label={t("proxies.overrides_shared_badge")}
                  tooltip={t("proxies.overrides_shared_tooltip")}
                  testId="proxy-overrides-shared"
                />
              ) : null}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-ink-3">
              {entry.id}
            </p>
          </div>
        ),
      },
      {
        key: "endpoint",
        label: t("proxies.endpoint_label"),
        width: COLUMN_WIDTH.badgeGroup,
        render: (entry) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
              {proxyProtocol(entry.url)}
            </span>
            <span className="truncate font-mono text-xs text-ink-2">
              {proxyEndpoint(entry)}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        label: t("proxies.latency"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (entry) => <ProxyLatencyCell result={checkState[entry.id]} />,
      },
      ...(showSharingColumn
        ? [
            {
              key: "sharing",
              label: t("resource_sharing.column"),
              width: COLUMN_WIDTH.name,
              render: (entry: ProxyPoolEntry) => (
                <ProxySharingCell
                  entry={entry}
                  tenantNames={sharingTenantNames}
                  onAdopt={sharingManageable ? openAdopt : undefined}
                />
              ),
            },
          ]
        : []),
      {
        key: "description",
        label: t("proxies.remark_label"),
        width: COLUMN_WIDTH.badgeGroup,
        render: (entry) => (
          <p className="truncate text-xs text-ink-2">
            {entry.description || "--"}
          </p>
        ),
      },
      {
        key: "actions",
        label: t("proxies.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
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
              {sharingManageable ? (
                <Button
                  aria-label={t("proxies.sharing_label", { name: entry.name })}
                  title={t("proxies.sharing_label", { name: entry.name })}
                  onClick={() => openSharing(entry)}
                  size="xs"
                >
                  <Share2 size={14} />
                </Button>
              ) : null}
              {overriddenSharedKeys.has(proxyIdKey(entry.id)) ? (
                <Button
                  aria-label={t("proxies.switch_label", { name: entry.name })}
                  title={t("proxies.switch_label", { name: entry.name })}
                  onClick={() => setSwitchTarget(entry)}
                  size="xs"
                >
                  <ArrowRightLeft size={14} />
                </Button>
              ) : null}
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
    [
      checkEntry,
      checkState,
      openAdopt,
      openEdit,
      openSharing,
      overriddenSharedKeys,
      sharingManageable,
      sharingTenantNames,
      showSharingColumn,
      t,
    ],
  );


  // 有平台共享分区时改成随内容流动：两张表都按内容定高、整页滚动。钉满一屏的写法会让自有表
  // 吃掉所有剩余高度，几条自有代理下面空出一大片，共享分区却被挤到最底下。
  const hasSharedSection = sharedEntries.length > 0;

  return (
    <div
      data-page-fill={hasSharedSection ? undefined : "always"}
      className={
        hasSharedSection
          ? "flex flex-col gap-5"
          : "flex min-h-0 flex-1 flex-col gap-5 md:overflow-hidden"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{t("proxies.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
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

      {/* flat：外壳内容区就是这一页的面板，表格直接落在上面，不再套一张卡片。 */}
      <Card
        flat
        className={
          hasSharedSection
            ? "overflow-hidden"
            : "overflow-hidden md:flex md:min-h-0 md:flex-1 md:flex-col"
        }
        bodyClassName={hasSharedSection ? undefined : "md:flex md:min-h-0 md:flex-1 md:flex-col"}
        loading={loading && entries.length === 0}
      >
        <DataTable<ProxyPoolEntry>
          tableId="proxy-pool"
          rows={sortedEntries}
          columns={columns}
          rowKey={(entry) => entry.id}
          rowHeight={56}
          height={
            hasSharedSection ? "h-auto max-h-[60vh]" : "h-auto max-h-[70vh] md:max-h-none md:flex-1"
          }
          minHeight={hasSharedSection ? "min-h-0" : "min-h-[240px] md:min-h-0"}
          minWidth="min-w-[960px]"
          caption={t("proxies.table_caption")}
          emptyText={t("proxies.empty_title")}
          showAllLoadedMessage={false}
        />
      </Card>

      {/* 租户视角：平台共享给本租户的代理，只读；和上面同为页面级分区，不再套卡片。 */}
      {hasSharedSection ? (
        <SharedProxiesSection
          entries={sharedEntries}
          checkState={checkState}
          onCheck={checkSharedEntry}
        />
      ) : null}

      <ProxyFormModal
        open={editingID !== null}
        editing={Boolean(editingID)}
        draft={draft}
        setDraft={setDraft}
        error={formError}
        onClearError={() => setFormError(null)}
        saving={saving}
        onSubmit={() => void saveDraft()}
        onClose={closeModal}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("proxies.delete_title")}
        description={t("proxies.delete_lead")}
        subject={deleteTarget ? <ProxySubject entry={deleteTarget} /> : null}
        consequences={[
          deleteTarget && overriddenSharedKeys.has(proxyIdKey(deleteTarget.id))
            ? t("proxies.delete_consequence_shared")
            : t("proxies.delete_consequence_bindings"),
          // 系统租户删除已共享的代理：被授权租户里选用它的账号也一起失去它。
          ...(deleteTarget?.sharing ? [t("proxies.delete_consequence_granted")] : []),
        ]}
        confirmText={t("proxies.delete_confirm")}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void removeOwnEntry(deleteTarget.id, t("proxies.deleted")).then((removed) => {
            if (removed) setDeleteTarget(null);
          });
        }}
      />

      {/* 租户视角：删掉覆盖了平台共享代理的那条自有代理，账号按 ID 引用，自动改用共享版本。 */}
      <ConfirmModal
        open={switchTarget !== null}
        variant="warning"
        icon={<ArrowRightLeft />}
        title={t("proxies.switch_title", { name: switchTarget?.name ?? "" })}
        description={t("proxies.switch_lead")}
        subject={switchTarget ? <ProxySubject entry={switchTarget} /> : null}
        consequences={[
          t("proxies.switch_consequence_delete"),
          t("proxies.switch_consequence_accounts"),
        ]}
        confirmText={t("proxies.switch_confirm")}
        confirmDisabled={switchBlocked}
        busy={deleting}
        onClose={() => setSwitchTarget(null)}
        onConfirm={() => {
          if (!switchTarget) return;
          const target = switchTarget;
          void removeOwnEntry(target.id, t("proxies.switch_done", { name: target.name })).then(
            (removed) => {
              if (!removed) return;
              setSwitchTarget(null);
              // 共享分区的「已被覆盖」标记与延迟检测以服务端为准，重新拉一次。
              void loadEntries();
            },
          );
        }}
      >
        {switchBlocked ? (
          <Callout tone="warning">{t("proxies.switch_blocked_disabled")}</Callout>
        ) : null}
      </ConfirmModal>

      <ProxySharingDialogs sharing={proxySharing} />
    </div>
  );
}

/** 确认框里的对象卡片：名称 + 协议 · 主机（不显示账号密码）。 */
function ProxySubject({ entry }: { entry: ProxyPoolEntry }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate font-medium">{entry.name}</span>
      <span className="shrink-0 font-mono text-xs text-ink-3">
        {proxyProtocol(entry.maskedUrl || entry.url)} · {proxyEndpoint(entry)}
      </span>
    </span>
  );
}
