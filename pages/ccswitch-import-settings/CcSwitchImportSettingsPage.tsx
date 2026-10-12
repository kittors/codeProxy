import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { detectApiBaseFromLocation, modelsApi } from "@code-proxy/api-client";
import {
  channelGroupsApi,
  type ChannelGroupChannelDetail,
} from "@code-proxy/api-client/endpoints/channel-groups";
import { normalizeProviderKey } from "@code-proxy/domain";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import {
  ccSwitchImportConfigsApi,
  NO_CC_SWITCH_IMPORT_CAPABILITIES,
  type CcSwitchImportCapabilities,
} from "@code-proxy/api-client/endpoints/ccswitch-import-configs";
import { Button, COLUMN_WIDTH } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { DataTable, TABLE_ROW_ACTIONS_COLUMN, type DataTableColumn } from "@code-proxy/ui";
import {
  CcSwitchClientIcon,
  CcSwitchImportConfigModal,
  createConfigDraft,
  getPrimaryModel,
  getRouteModels,
  type CcSwitchChannelGroupOption,
} from "@features/ccswitch-import";
import {
  normalizeCcSwitchImportConfigList,
  type CcSwitchImportConfigListItem,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import {
  getCcSwitchClientConfig,
  LEGACY_CC_SWITCH_CLIENT_TYPES,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchClients";

/** 表格里的模型、渠道分组等次要标签：中性淡底，不描边。 */
const NEUTRAL_TAG = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

/** New presets start on Codex, like the earlier editor; the app can be switched before saving. */
const NEW_PRESET_CLIENT: CcSwitchClientType = "codex";

const normalizeModelOwnerKey = (value: string): string =>
  value.trim().replace(/\s+/g, "-").toLowerCase();

const getChannelGroupModelOwnerKeys = (
  details: readonly ChannelGroupChannelDetail[] | undefined,
  channels: readonly string[] | undefined,
): string[] => {
  const keys = new Set<string>();
  for (const channel of channels ?? []) {
    const key = normalizeModelOwnerKey(String(channel ?? ""));
    if (key) keys.add(key);
  }
  for (const detail of details ?? []) {
    const values = [
      detail.source,
      detail.name,
      ...(detail.default_tags ?? []),
      ...(detail.custom_tags ?? []),
      ...(detail.display_tags ?? []),
    ];
    for (const value of values) {
      const key = normalizeModelOwnerKey(String(value ?? ""));
      if (key) keys.add(key);
    }
  }
  return Array.from(keys);
};

const getChannelGroupMappedModelOwnerKeys = (
  details: readonly ChannelGroupChannelDetail[] | undefined,
  channels: readonly string[] | undefined,
  ownerByAuthGroup: Record<string, string>,
): string[] => {
  const keys = new Set<string>();
  for (const channel of channels ?? []) {
    const authGroup = normalizeProviderKey(String(channel ?? ""));
    const owner = normalizeModelOwnerKey(ownerByAuthGroup[authGroup] ?? "");
    if (owner) keys.add(owner);
  }
  for (const detail of details ?? []) {
    const values = [
      detail.source,
      detail.name,
      ...(detail.default_tags ?? []),
      ...(detail.custom_tags ?? []),
      ...(detail.display_tags ?? []),
    ];
    for (const value of values) {
      const authGroup = normalizeProviderKey(String(value ?? ""));
      const owner = normalizeModelOwnerKey(ownerByAuthGroup[authGroup] ?? "");
      if (owner) keys.add(owner);
    }
  }
  return Array.from(keys);
};

export function CcSwitchImportSettingsPage() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const { notify } = useToast();
  const [configs, setConfigs] = useState<CcSwitchImportConfigListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<CcSwitchImportConfigListItem>(() =>
    createConfigDraft(NEW_PRESET_CLIENT),
  );
  // The apps this backend accepts. A backend without the `client-types` field predates
  // OpenCode / OpenClaw / Hermes and would reject them on save.
  const [clientTypes, setClientTypes] = useState<readonly CcSwitchClientType[]>(
    LEGACY_CC_SWITCH_CLIENT_TYPES,
  );
  // Fields beyond the base row (the Codex context window) are shown and sent only when the
  // backend reports it stores them.
  const [capabilities, setCapabilities] = useState<CcSwitchImportCapabilities>(
    NO_CC_SWITCH_IMPORT_CAPABILITIES,
  );
  const [pendingDelete, setPendingDelete] = useState<CcSwitchImportConfigListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [channelGroupsLoading, setChannelGroupsLoading] = useState(false);
  const [channelGroupOptions, setChannelGroupOptions] = useState<CcSwitchChannelGroupOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    setChannelGroupsLoading(true);
    Promise.all([
      channelGroupsApi.list(),
      modelsApi.getAuthGroupModelOwnerMappingMap().catch(() => ({})),
    ])
      .then(([items, ownerMappings]) => {
        if (cancelled) return;
        setChannelGroupOptions(
          items
            .filter((item) => item.implicit !== true || item.name === "default")
            .map((item) => ({
              value: String(item.name ?? "")
                .trim()
                .toLowerCase(),
              label: String(item.name ?? "")
                .trim()
                .toLowerCase(),
              description:
                typeof item.description === "string" && item.description.trim()
                  ? item.description.trim()
                  : undefined,
              routePath: Array.isArray(item["path-routes"]) ? item["path-routes"][0] : "",
              allowedModels: Array.isArray(item["allowed-models"]) ? item["allowed-models"] : [],
              excludedModels: Array.isArray(item["excluded-models"]) ? item["excluded-models"] : [],
              channels: Array.isArray(item.channels) ? item.channels : [],
              modelOwnerKeys: getChannelGroupModelOwnerKeys(item.channelDetails, item.channels),
              authoritativeModelOwnerKeys: getChannelGroupMappedModelOwnerKeys(
                item.channelDetails,
                item.channels,
                ownerMappings,
              ),
            }))
            .filter((item) => item.value)
            .sort((left, right) => left.label.localeCompare(right.label)),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setChannelGroupOptions([]);
      })
      .finally(() => {
        if (!cancelled) setChannelGroupsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    ccSwitchImportConfigsApi
      .snapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setConfigs(snapshot.configs);
        setClientTypes(snapshot.clientTypes ?? LEGACY_CC_SWITCH_CLIENT_TYPES);
        setCapabilities(snapshot.capabilities);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("common.load_failed"),
        });
        setConfigs([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [notify, t]);

  const columns = useMemo<DataTableColumn<CcSwitchImportConfigListItem>[]>(
    () => [
      {
        key: "client",
        label: t("ccswitch.config_table_client"),
        width: "w-56",
        render: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <CcSwitchClientIcon clientType={row.clientType} className="h-5 w-5" />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">
                {t(getCcSwitchClientConfig(row.clientType).labelKey)}
              </div>
              <div className="truncate font-mono text-xs text-ink-3">{row.routePath || "/"}</div>
            </div>
          </div>
        ),
      },
      {
        key: "provider",
        label: t("ccswitch.config_table_provider"),
        width: COLUMN_WIDTH.nameStacked,
        overflowTooltip: (row) =>
          row.note ? `${row.providerName}\n${row.note}` : row.providerName,
        render: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">
              {row.providerName}
            </div>
            <div className="truncate text-xs text-ink-3">
              {row.note || t("ccswitch.config_no_remark")}
            </div>
          </div>
        ),
      },
      {
        key: "model",
        label: t("ccswitch.config_table_model"),
        width: COLUMN_WIDTH.name,
        overflowTooltip: (row) => {
          const models = row.clientType === "claude" ? [] : getRouteModels(row);
          return models.length > 1 ? models.join("\n") : getPrimaryModel(row);
        },
        render: (row) => {
          const primary = getPrimaryModel(row);
          const others =
            row.clientType === "claude"
              ? 0
              : getRouteModels(row).filter((model) => model !== primary).length;
          return (
            <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
              <span
                className={`inline-flex min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 py-1 font-mono text-xs ${NEUTRAL_TAG}`}
              >
                {primary}
              </span>
              {others > 0 ? (
                <span className="shrink-0 text-xs text-ink-3">
                  {t("ccswitch.config_table_more_models", { count: others })}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        key: "groups",
        label: t("ccswitch.config_table_groups"),
        width: COLUMN_WIDTH.nameStacked,
        overflowTooltip: (row) =>
          row.allowedChannelGroups.length > 0 ? row.allowedChannelGroups.join(", ") : null,
        render: (row) =>
          row.allowedChannelGroups.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.allowedChannelGroups.map((group) => (
                <span
                  key={group}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${NEUTRAL_TAG}`}
                >
                  {group}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-ink-3">
              {t("ccswitch.import_channel_group_none")}
            </span>
          ),
      },
      {
        key: "actions",
        label: t("ccswitch.config_table_actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <div className="flex justify-end gap-1">
            <Button
              size="xs"
              variant="ghost"
              aria-label={t("ccswitch.config_edit")}
              onClick={() => {
                setModalMode("edit");
                setDraft(row);
                setModalOpen(true);
              }}
            >
              <Pencil size={14} />
            </Button>
            <Button
              size="xs"
              variant="ghost-danger"
              aria-label={t("ccswitch.config_delete")}
              onClick={() => setPendingDelete(row)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const persistConfigs = async (next: CcSwitchImportConfigListItem[]) => {
    const normalized = normalizeCcSwitchImportConfigList(next);
    await ccSwitchImportConfigsApi.replace(normalized, capabilities);
    setConfigs(normalized);
  };
  const importBaseUrl = auth?.state.apiBase || detectApiBaseFromLocation();

  return (
    <div data-page-fill="md" className="space-y-6 md:flex md:min-h-0 md:flex-1 md:flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 md:shrink-0">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal text-ink">
            {t("ccswitch.settings_title")}
          </h2>
          <p className="max-w-3xl text-sm text-ink-2">
            {t("ccswitch.settings_description")}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setModalMode("create");
            setDraft(createConfigDraft(NEW_PRESET_CLIENT));
            setModalOpen(true);
          }}
        >
          <Plus size={14} />
          {t("ccswitch.config_new")}
        </Button>
      </div>

      {/* 外壳内容区就是页面面板：配置列表是页面里的一个分区（flat），不再包一张卡。 */}
      <Card
        flat
        title={t("ccswitch.config_table_title")}
        description={t("ccswitch.config_table_description", { count: configs.length })}
        className="md:flex md:min-h-0 md:flex-1 md:flex-col"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
      >
        <DataTable<CcSwitchImportConfigListItem>
          tableId="ccswitch-import-configs"
          rows={configs}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
          virtualize={false}
          minWidth="min-w-[960px]"
          height="h-[420px] md:h-auto md:flex-1"
          minHeight="min-h-[280px] md:min-h-0"
          caption={t("ccswitch.config_table_caption")}
          emptyText={t("ccswitch.config_list_empty")}
          showAllLoadedMessage={false}
        />
      </Card>

      <CcSwitchImportConfigModal
        open={modalOpen}
        mode={modalMode}
        value={draft}
        baseUrl={importBaseUrl}
        channelGroupOptions={channelGroupOptions}
        channelGroupsLoading={channelGroupsLoading}
        clientTypes={clientTypes}
        codexContextWindowSupported={capabilities.codexContextWindow}
        onClose={() => setModalOpen(false)}
        onSave={async (value) => {
          const next =
            modalMode === "edit"
              ? configs.map((item) => (item.id === value.id ? value : item))
              : [value, ...configs];
          try {
            await persistConfigs(next);
            setModalOpen(false);
            notify({
              type: "success",
              message: t(
                modalMode === "edit" ? "ccswitch.config_updated" : "ccswitch.config_created",
              ),
            });
          } catch (error: unknown) {
            notify({
              type: "error",
              message: error instanceof Error ? error.message : t("common.save_failed"),
            });
          }
        }}
      />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={t("ccswitch.config_delete_title")}
        description={t("ccswitch.config_delete_lead")}
        subject={
          pendingDelete ? (
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-medium">{pendingDelete.providerName}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${NEUTRAL_TAG}`}>
                {t(getCcSwitchClientConfig(pendingDelete.clientType).labelKey)}
              </span>
            </span>
          ) : null
        }
        consequences={[t("ccswitch.config_delete_consequence")]}
        confirmText={t("ccswitch.config_delete_confirm")}
        // 异步删除期间锁住按钮，避免连点删两次。
        busy={deleting}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await persistConfigs(configs.filter((item) => item.id !== pendingDelete.id));
            setPendingDelete(null);
            notify({ type: "success", message: t("ccswitch.config_deleted") });
          } catch (error: unknown) {
            notify({
              type: "error",
              message: error instanceof Error ? error.message : t("common.save_failed"),
            });
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
