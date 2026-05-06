import type { TFunction } from "i18next";
import {
  BarChart3,
  Copy,
  Infinity as InfinityIcon,
  Info,
  Pencil,
  Power,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import {
  formatApiKeyDate,
  formatApiKeyLimit,
  maskApiKey,
  VendorIcon,
} from "@/modules/api-keys/apiKeyPageUtils";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import type { VirtualTableColumn } from "@/modules/ui/VirtualTable";

type CreateApiKeyColumnsOptions = {
  t: TFunction;
  onToggleDisable: (index: number) => void;
  onViewUsage: (entry: ApiKeyEntry) => void;
  onCopy: (key: string) => void;
  onImportToCcSwitch: (entry: ApiKeyEntry) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
};

export const createApiKeyColumns = ({
  t,
  onToggleDisable,
  onViewUsage,
  onCopy,
  onImportToCcSwitch,
  onEdit,
  onDelete,
}: CreateApiKeyColumnsOptions): VirtualTableColumn<ApiKeyEntry>[] => [
  {
    key: "status",
    label: t("api_keys_page.col_status"),
    width: "w-[88px] min-w-[88px]",
    headerClassName: "text-center",
    cellClassName: "text-center",
    render: (row, idx) => (
      <button
        type="button"
        onClick={() => onToggleDisable(idx)}
        aria-label={
          row.disabled ? t("api_keys_page.click_enable") : t("api_keys_page.click_disable")
        }
        data-tooltip-placement="bottom"
        title={row.disabled ? t("api_keys_page.click_enable") : t("api_keys_page.click_disable")}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          row.disabled
            ? "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            : "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
        }`}
      >
        <Power size={15} />
      </button>
    ),
  },
  {
    key: "name",
    label: t("api_keys_page.col_name"),
    width: "w-[120px] min-w-[120px]",
    cellClassName: "font-medium",
    render: (row) => (
      <OverflowTooltip content={row.name || t("api_keys_page.unnamed")} className="block min-w-0">
        <span className="block min-w-0 truncate">
          {row.name || (
            <span className="text-slate-400 dark:text-white/40">{t("common.unnamed")}</span>
          )}
        </span>
      </OverflowTooltip>
    ),
  },
  {
    key: "key",
    label: t("api_keys_page.col_key"),
    width: "w-[320px] min-w-[320px]",
    cellClassName: "whitespace-nowrap",
    render: (row) => (
      <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
        {maskApiKey(row.key)}
      </code>
    ),
  },
  {
    key: "dailyLimit",
    label: t("api_keys_page.col_daily_limit"),
    width: "w-[132px] min-w-[132px]",
    cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
    render: (row) => (
      <span className="inline-flex items-center gap-1">
        {!row["daily-limit"] ? (
          <>
            <InfinityIcon size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}
          </>
        ) : (
          formatApiKeyLimit(row["daily-limit"])
        )}
      </span>
    ),
  },
  {
    key: "totalQuota",
    label: t("api_keys_page.col_total_quota"),
    width: "w-[132px] min-w-[132px]",
    cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
    render: (row) => (
      <span className="inline-flex items-center gap-1">
        {!row["total-quota"] ? (
          <>
            <InfinityIcon size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}
          </>
        ) : (
          formatApiKeyLimit(row["total-quota"])
        )}
      </span>
    ),
  },
  {
    key: "rpmLimit",
    label: "RPM",
    width: "w-[108px] min-w-[108px]",
    cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
    headerRender: () => (
      <HoverTooltip content={t("api_keys.rpm_full")} className="inline-flex items-center gap-1">
        <span>{t("api_keys_page.rpm")}</span>
        <Info size={12} className="text-slate-400 dark:text-white/40" />
      </HoverTooltip>
    ),
    render: (row) => (
      <span className="inline-flex items-center gap-1">
        {!row["rpm-limit"] ? (
          <>
            <InfinityIcon size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}
          </>
        ) : (
          formatApiKeyLimit(row["rpm-limit"])
        )}
      </span>
    ),
  },
  {
    key: "tpmLimit",
    label: "TPM",
    width: "w-[108px] min-w-[108px]",
    cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
    headerRender: () => (
      <HoverTooltip content={t("api_keys.tpm_full")} className="inline-flex items-center gap-1">
        <span>{t("api_keys_page.tpm")}</span>
        <Info size={12} className="text-slate-400 dark:text-white/40" />
      </HoverTooltip>
    ),
    render: (row) => (
      <span className="inline-flex items-center gap-1">
        {!row["tpm-limit"] ? (
          <>
            <InfinityIcon size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}
          </>
        ) : (
          formatApiKeyLimit(row["tpm-limit"])
        )}
      </span>
    ),
  },
  {
    key: "allowedModels",
    label: t("api_keys_page.col_models"),
    width: "w-[150px] min-w-[150px]",
    cellClassName: "min-w-0 overflow-hidden text-slate-700 dark:text-white/70",
    render: (row) =>
      row["allowed-models"]?.length ? (
        <HoverTooltip
          content={
            <div className="flex max-w-xs flex-wrap gap-1.5">
              {row["allowed-models"].map((model) => (
                <span
                  key={model}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                >
                  <VendorIcon modelId={model} size={12} />
                  {model}
                </span>
              ))}
            </div>
          }
          className="block min-w-0"
        >
          <span className="inline-flex min-w-0 w-full items-center gap-1.5 text-xs">
            <span className="inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-md bg-indigo-50 px-1.5 font-semibold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              {row["allowed-models"].length}
            </span>
            <span className="block min-w-0 flex-1 truncate text-slate-500 dark:text-white/50">
              {row["allowed-models"][0]}
            </span>
          </span>
        </HoverTooltip>
      ) : (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
          <ShieldCheck size={14} /> {t("api_keys_page.all_models")}
        </span>
      ),
  },
  {
    key: "allowedChannelGroups",
    label: t("api_keys_page.col_channel_groups"),
    width: "w-[172px] min-w-[172px]",
    cellClassName: "min-w-0 overflow-hidden text-slate-700 dark:text-white/70",
    render: (row) =>
      row["allowed-channel-groups"]?.length ? (
        <HoverTooltip
          content={
            <div className="flex max-w-xs flex-wrap gap-1.5">
              {row["allowed-channel-groups"].map((group) => (
                <span
                  key={group}
                  className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                >
                  {group}
                </span>
              ))}
            </div>
          }
          className="block min-w-0"
        >
          <span className="inline-flex min-w-0 w-full items-center gap-1.5 text-xs">
            <span className="inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-md bg-violet-50 px-1.5 font-semibold tabular-nums text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {row["allowed-channel-groups"].length}
            </span>
            <span className="block min-w-0 flex-1 truncate text-slate-500 dark:text-white/50">
              {row["allowed-channel-groups"][0]}
            </span>
          </span>
        </HoverTooltip>
      ) : (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
          <ShieldCheck size={14} /> {t("api_keys_page.all_channel_groups")}
        </span>
      ),
  },
  {
    key: "allowedChannels",
    label: t("api_keys_page.col_channels"),
    width: "w-[172px] min-w-[172px]",
    cellClassName: "min-w-0 overflow-hidden text-slate-700 dark:text-white/70",
    render: (row) =>
      row["allowed-channels"]?.length ? (
        <HoverTooltip
          content={
            <div className="flex max-w-xs flex-wrap gap-1.5">
              {row["allowed-channels"].map((channel) => (
                <span
                  key={channel}
                  className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                >
                  {channel}
                </span>
              ))}
            </div>
          }
          className="block min-w-0"
        >
          <span className="inline-flex min-w-0 w-full items-center gap-1.5 text-xs">
            <span className="inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-md bg-cyan-50 px-1.5 font-semibold tabular-nums text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
              {row["allowed-channels"].length}
            </span>
            <span className="block min-w-0 flex-1 truncate text-slate-500 dark:text-white/50">
              {row["allowed-channels"][0]}
            </span>
          </span>
        </HoverTooltip>
      ) : (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
          <ShieldCheck size={14} /> {t("api_keys_page.all_channels")}
        </span>
      ),
  },
  {
    key: "createdAt",
    label: t("api_keys_page.col_created"),
    width: "w-[168px] min-w-[168px]",
    cellClassName: "whitespace-nowrap text-slate-500 dark:text-white/50",
    render: (row) => <>{formatApiKeyDate(row["created-at"])}</>,
  },
  {
    key: "actions",
    label: t("api_keys_page.col_actions"),
    width: "w-[188px] min-w-[188px]",
    render: (row, idx) => {
      const viewUsageLabel = t("api_keys_page.view_usage");
      const copyKeyLabel = t("api_keys_page.copy_key");
      const importLabel = t("ccswitch.import_to_ccswitch");
      const editLabel = t("common.edit");
      const deleteLabel = t("common.delete");

      return (
        <div className="flex items-center gap-1.5">
          <HoverTooltip content={viewUsageLabel}>
            <button
              type="button"
              onClick={() => onViewUsage(row)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-blue-400"
              aria-label={viewUsageLabel}
            >
              <BarChart3 size={15} />
            </button>
          </HoverTooltip>
          <HoverTooltip content={copyKeyLabel}>
            <button
              type="button"
              onClick={() => onCopy(row.key)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
              aria-label={copyKeyLabel}
            >
              <Copy size={15} />
            </button>
          </HoverTooltip>
          <HoverTooltip content={importLabel}>
            <button
              type="button"
              onClick={() => onImportToCcSwitch(row)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-cyan-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-cyan-400"
              aria-label={importLabel}
            >
              <Upload size={15} />
            </button>
          </HoverTooltip>
          <HoverTooltip content={editLabel}>
            <button
              type="button"
              onClick={() => onEdit(idx)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
              aria-label={editLabel}
            >
              <Pencil size={15} />
            </button>
          </HoverTooltip>
          <HoverTooltip content={deleteLabel}>
            <button
              type="button"
              onClick={() => onDelete(idx)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              aria-label={deleteLabel}
            >
              <Trash2 size={15} />
            </button>
          </HoverTooltip>
        </div>
      );
    },
  },
];
