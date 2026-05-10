import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import { detectApiBaseFromLocation } from "@/lib/connection";
import {
  channelGroupsApi,
  type ChannelGroupChannelDetail,
} from "@/lib/http/apis/channel-groups";
import {
  normalizeProviderKey,
  readAuthFilesModelOwnerGroupMap,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import { useOptionalAuth } from "@/modules/auth/AuthProvider";
import { ccSwitchImportConfigsApi } from "@/lib/http/apis/ccswitch-import-configs";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { useToast } from "@/modules/ui/ToastProvider";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import {
  CcSwitchImportConfigModal,
  type CcSwitchChannelGroupOption,
} from "@/modules/ccswitch/CcSwitchImportConfigModal";
import {
  createCcSwitchImportConfig,
  normalizeCcSwitchImportConfigList,
  type CcSwitchImportConfigListItem,
} from "@/modules/ccswitch/ccswitchImportConfigList";
import {
  getCcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

function createDraft(clientType: CcSwitchClientType = "codex") {
  return {
    ...createCcSwitchImportConfig({ clientType }),
    providerName: "",
  };
}

const normalizeModelOwnerKey = (value: string): string =>
  value.trim().replace(/\s+/g, "-").toLowerCase();

const getChannelGroupModelOwnerKeys = (
  details: readonly ChannelGroupChannelDetail[] | undefined,
): string[] => {
  const keys = new Set<string>();
  for (const detail of details ?? []) {
    const values = [
      detail.source,
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
): string[] => {
  const ownerByAuthGroup = readAuthFilesModelOwnerGroupMap();
  const keys = new Set<string>();
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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<CcSwitchImportConfigListItem>(() => createDraft());
  const [pendingDelete, setPendingDelete] = useState<CcSwitchImportConfigListItem | null>(null);
  const [channelGroupsLoading, setChannelGroupsLoading] = useState(false);
  const [channelGroupOptions, setChannelGroupOptions] = useState<CcSwitchChannelGroupOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    setChannelGroupsLoading(true);
    channelGroupsApi
      .list()
      .then((items) => {
        if (cancelled) return;
        setChannelGroupOptions(
          items
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
              channels: Array.isArray(item.channels) ? item.channels : [],
              modelOwnerKeys: getChannelGroupModelOwnerKeys(item.channelDetails),
              authoritativeModelOwnerKeys: getChannelGroupMappedModelOwnerKeys(item.channelDetails),
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

    ccSwitchImportConfigsApi
      .list()
      .then((items) => {
        if (cancelled) return;
        setConfigs(items);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("common.load_failed"),
        });
        setConfigs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [notify, t]);

  const columns = useMemo<VirtualTableColumn<CcSwitchImportConfigListItem>[]>(
    () => [
      {
        key: "client",
        label: t("ccswitch.config_table_client"),
        width: "w-56",
        render: (row) => {
          const client = getCcSwitchClientConfig(row.clientType);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/75 bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900">
                <img src={iconByType[row.clientType]} alt="" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900 dark:text-white">
                  {t(client.labelKey)}
                </div>
                <div className="font-mono text-[11px] text-slate-500 dark:text-white/45">
                  {row.endpointPath || t("ccswitch.import_endpoint_root")}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        key: "provider",
        label: t("ccswitch.config_table_provider"),
        width: "w-72",
        overflowTooltip: (row) =>
          row.note ? `${row.providerName}\n${row.note}` : row.providerName,
        render: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-white">
              {row.providerName}
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-white/55">
              {row.note || t("ccswitch.config_no_remark")}
            </div>
          </div>
        ),
      },
      {
        key: "model",
        label: t("ccswitch.config_table_model"),
        width: "w-52",
        overflowTooltip: true,
        render: (row) => (
          <span className="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-200/70 bg-white px-2 py-1 font-mono text-xs text-slate-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/65">
            {row.defaultModel}
          </span>
        ),
      },
      {
        key: "groups",
        label: t("ccswitch.config_table_groups"),
        width: "w-72",
        overflowTooltip: (row) =>
          row.allowedChannelGroups.length > 0 ? row.allowedChannelGroups.join(", ") : null,
        render: (row) =>
          row.allowedChannelGroups.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.allowedChannelGroups.map((group) => (
                <span
                  key={group}
                  className="rounded-full border border-slate-200/75 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/60"
                >
                  {group}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-400 dark:text-white/35">
              {t("ccswitch.import_channel_group_none")}
            </span>
          ),
      },
      {
        key: "actions",
        label: t("ccswitch.config_table_actions"),
        width: "w-28",
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
              variant="ghost"
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
    await ccSwitchImportConfigsApi.replace(normalized);
    setConfigs(normalized);
  };
  const importBaseUrl = auth?.state.apiBase || detectApiBaseFromLocation();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950 dark:text-white">
            {t("ccswitch.settings_title")}
          </h2>
          <p className="max-w-3xl text-sm text-slate-600 dark:text-white/60">
            {t("ccswitch.settings_description")}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setModalMode("create");
            setDraft(createDraft());
            setModalOpen(true);
          }}
        >
          <Plus size={14} />
          {t("ccswitch.config_new")}
        </Button>
      </div>

      <Card
        title={t("ccswitch.config_table_title")}
        description={t("ccswitch.config_table_description", { count: configs.length })}
        padding="compact"
        className="rounded-2xl"
      >
        <VirtualTable<CcSwitchImportConfigListItem>
          rows={configs}
          columns={columns}
          rowKey={(row) => row.id}
          virtualize={false}
          minWidth="min-w-[1100px]"
          height="h-[420px]"
          minHeight="min-h-[280px]"
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
        description={t("ccswitch.config_delete_description", {
          name: pendingDelete?.providerName ?? "",
        })}
        confirmText={t("ccswitch.config_delete_confirm")}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await persistConfigs(configs.filter((item) => item.id !== pendingDelete.id));
            setPendingDelete(null);
            notify({ type: "success", message: t("ccswitch.config_deleted") });
          } catch (error: unknown) {
            notify({
              type: "error",
              message: error instanceof Error ? error.message : t("common.save_failed"),
            });
          }
        }}
      />
    </div>
  );
}
