import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit3, Plus, RefreshCw, Search, Shuffle, Trash2 } from "lucide-react";
import {
  apiClient,
  channelGroupsApi,
  extractApiErrorCode,
  isApiClientError,
  routingVirtualModelsApi,
  type RoutingVirtualModel,
  type RoutingVirtualModelsSnapshot,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  ConfirmModal,
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  TextInput,
  useToast,
  type DataTableColumn,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { VirtualModelEditorModal } from "./VirtualModelEditorModal";
import {
  MAX_VIRTUAL_MODELS,
  applyDraft,
  memberRoute,
  removeVirtualModel,
  toDraft,
  type VirtualModelDraft,
} from "./virtualModelDrafts";

const isVersionConflict = (err: unknown) =>
  isApiClientError(err) &&
  err.status === 409 &&
  extractApiErrorCode(err.payload) === "config_version_conflict";

const PILL =
  "inline-flex max-w-full items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs text-ink-2 dark:bg-white/[0.07] colorful:bg-sky-50 colorful:text-sky-700 colorful:dark:bg-sky-500/15 colorful:dark:text-sky-200";

/**
 * 模型页「虚拟模型」标签：一个模型名由几个真实模型轮流承接，请求按成员顺序尝试，前一个接不了
 * 且还没有内容发给客户端时换下一个。列表整体随路由配置一起存版本：保存时带上读到的版本，
 * 别人在这期间改过就是 409，这时重新读一遍、保留编辑框里的内容，再点一次保存会改在新列表上。
 */
export function VirtualModelsPanel() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const canEdit = auth ? auth.can("routing.write") : true;

  const [snapshot, setSnapshot] = useState<RoutingVirtualModelsSnapshot | null>(null);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<SearchableSelectOption[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<VirtualModelDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoutingVirtualModel | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await routingVirtualModelsApi.get());
      return true;
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("models_page.virtual.load_failed"),
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void reload();
    // 分组和模型只用来填编辑框的下拉，读不到时编辑框照样能用（模型可以手填）。
    void channelGroupsApi
      .list()
      .then((items) =>
        setGroups(items.map((item) => item.name.trim().toLowerCase()).filter(Boolean)),
      )
      .catch(() => setGroups([]));
    void Promise.resolve()
      .then(() => apiClient.get<{ data?: Array<{ id?: string }> }>("/models"))
      .then((payload) => {
        const ids = Array.from(
          new Set((payload?.data ?? []).map((model) => model.id?.trim() ?? "").filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b));
        setModelOptions(ids.map((id) => ({ value: id, label: id })));
      })
      .catch(() => setModelOptions([]));
  }, [reload]);

  /** 把 build 作用在最新的列表上再保存；成功后重新读一遍，拿到新版本和后端整理后的写法。 */
  const persist = useCallback(
    async (build: (list: RoutingVirtualModel[]) => RoutingVirtualModel[], message: string) => {
      const current = snapshotRef.current;
      if (!current) return false;
      setSaving(true);
      try {
        await routingVirtualModelsApi.update(build(current.virtualModels), current.version);
        await reload();
        notify({ type: "success", message });
        return true;
      } catch (err: unknown) {
        if (isVersionConflict(err)) {
          await reload();
          notify({ type: "error", message: t("models_page.virtual.conflict") });
          return false;
        }
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("models_page.virtual.save_failed"),
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [notify, reload, t],
  );

  const list = useMemo(() => snapshot?.virtualModels ?? [], [snapshot]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((vm) =>
      [vm.name, vm.description ?? "", ...vm.members.map(memberRoute)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [list, search]);
  const others = useMemo(() => {
    const original = draft?.originalName?.toLowerCase();
    return original ? list.filter((vm) => vm.name.toLowerCase() !== original) : list;
  }, [draft?.originalName, list]);

  const columns = useMemo<DataTableColumn<RoutingVirtualModel>[]>(
    () => [
      {
        key: "name",
        label: t("models_page.virtual.col_name"),
        width: "w-72 min-w-72",
        overflowTooltip: (vm) => vm.description || vm.name,
        render: (vm) => (
          <span className="block min-w-0">
            <span className="block truncate font-mono text-sm font-medium text-ink">{vm.name}</span>
            {vm.description ? (
              <span className="block truncate text-xs text-ink-3">{vm.description}</span>
            ) : null}
          </span>
        ),
      },
      {
        key: "members",
        label: t("models_page.virtual.col_members"),
        overflowTooltip: (vm) => vm.members.map(memberRoute).join(" → "),
        render: (vm) => (
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
            {vm.members.map((member, index) => (
              <li
                key={`${memberRoute(member)}-${index}`}
                className="flex min-w-0 items-center gap-1.5"
              >
                {index > 0 ? (
                  <span className="text-xs text-ink-4" aria-hidden="true">
                    →
                  </span>
                ) : null}
                <span className={PILL}>
                  <span className="truncate font-mono">
                    {member.group ? memberRoute(member) : member.model}
                  </span>
                  {vm.strategy === "weighted" ? (
                    <span className="tabular-nums text-ink-3">· {member.weight ?? 0}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ),
      },
      {
        key: "strategy",
        label: t("models_page.virtual.col_strategy"),
        // 表头旁还有拖动手柄：w-32 时「第一个成员」「Первый участник」都会被截断。
        width: "w-44 min-w-44",
        render: (vm) =>
          vm.strategy === "weighted"
            ? t("models_page.virtual.strategy_weighted")
            : t("models_page.virtual.strategy_order"),
      },
      ...(canEdit
        ? [
            {
              key: "actions",
              label: t("models_page.col_actions"),
              ...TABLE_ROW_ACTIONS_COLUMN,
              render: (vm: RoutingVirtualModel) => (
                <TableRowActions
                  moreLabel={t("common.more_actions")}
                  actions={[
                    {
                      key: "edit",
                      label: t("models_page.virtual.edit", { name: vm.name }),
                      icon: <Edit3 size={15} />,
                      onClick: () => setDraft(toDraft(vm)),
                    },
                    {
                      key: "delete",
                      label: t("models_page.virtual.delete", { name: vm.name }),
                      icon: <Trash2 size={15} />,
                      destructive: true,
                      onClick: () => setDeleteTarget(vm),
                    },
                  ]}
                />
              ),
            },
          ]
        : []),
    ],
    [canEdit, t],
  );

  const atLimit = list.length >= MAX_VIRTUAL_MODELS;

  return (
    <>
      <Card
        title={t("models_page.virtual.title")}
        description={t("models_page.virtual.description")}
        className="flex flex-1 flex-col overflow-hidden md:min-h-0"
        bodyClassName="relative flex min-h-0 flex-1 flex-col"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("models_page.virtual.search")}
              aria-label={t("models_page.virtual.search")}
              className="!w-48"
              startAdornment={<Search size={14} className="text-ink-3" />}
            />
            {canEdit ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDraft(toDraft())}
                disabled={loading || !snapshot || atLimit}
                aria-label={t("models_page.virtual.add")}
                title={
                  atLimit
                    ? t("models_page.virtual.at_limit", { max: MAX_VIRTUAL_MODELS })
                    : t("models_page.virtual.add")
                }
              >
                <Plus size={14} />
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void reload()}
              disabled={loading}
              aria-label={t("models_page.refresh")}
              title={t("models_page.refresh")}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      >
        <DataTable<RoutingVirtualModel>
          tableId="virtual-models"
          rows={filtered}
          columns={columns}
          rowKey={(vm) => vm.name}
          loading={loading && !snapshot}
          rowHeight={56}
          caption={t("models_page.virtual.title")}
          emptyText={
            search ? t("models_page.virtual.no_results") : t("models_page.virtual.empty_title")
          }
          emptyDescription={search ? undefined : t("models_page.virtual.empty_description")}
          emptyIcon={<Shuffle size={20} aria-hidden />}
          emptyAction={
            !search && canEdit && snapshot ? (
              <Button variant="primary" size="sm" onClick={() => setDraft(toDraft())}>
                <Plus size={14} />
                {t("models_page.virtual.add")}
              </Button>
            ) : undefined
          }
          minWidth="min-w-[960px]"
          height="h-[calc(100vh-430px)] md:h-auto md:flex-1"
          minHeight="min-h-[360px] md:min-h-0"
        />
      </Card>

      <VirtualModelEditorModal
        draft={draft}
        others={others}
        groups={groups}
        modelOptions={modelOptions}
        saving={saving}
        onChange={setDraft}
        onClose={() => {
          if (!saving) setDraft(null);
        }}
        onSave={(next) =>
          void persist((current) => applyDraft(current, next), t("models_page.virtual.saved")).then(
            (saved) => {
              if (saved) setDraft(null);
            },
          )
        }
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("models_page.virtual.delete_title")}
        description={t("models_page.virtual.delete_desc", { name: deleteTarget?.name ?? "" })}
        confirmText={t("models_page.delete")}
        busy={saving}
        onClose={() => {
          if (!saving) setDeleteTarget(null);
        }}
        onConfirm={() => {
          const target = deleteTarget;
          if (!target) return;
          void persist(
            (current) => removeVirtualModel(current, target.name),
            t("models_page.virtual.deleted"),
          ).then(() => setDeleteTarget(null));
        }}
      />
    </>
  );
}
