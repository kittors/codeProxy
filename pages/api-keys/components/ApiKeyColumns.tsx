import type { TFunction } from "i18next";
import type { ReactNode } from "react";
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
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import {
  formatApiKeyDate,
  formatApiKeyLimit,
  formatApiKeySpendingLimit,
  maskApiKey,
  VendorIcon,
} from "../apiKeyPageUtils";
import { Checkbox, HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import type { DataTableColumn } from "@code-proxy/ui";

type CreateApiKeyColumnsOptions = {
  t: TFunction;
  selectedKeys: Set<string>;
  allRowsSelected: boolean;
  someRowsSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  onSelectRow: (key: string, checked: boolean) => void;
  onToggleDisable: (index: number) => void;
  onViewUsage: (entry: ApiKeyEntry) => void;
  onCopy: (key: string) => void;
  onImportToCcSwitch: (entry: ApiKeyEntry) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
};

type PermissionSummaryTone = "cyan" | "indigo" | "violet";

const permissionSummaryToneClasses: Record<PermissionSummaryTone, string> = {
  cyan: "border-cyan-100 bg-cyan-50/65 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200",
  indigo:
    "border-indigo-100 bg-indigo-50/65 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200",
  violet:
    "border-violet-100 bg-violet-50/65 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
};

const permissionCountToneClasses: Record<PermissionSummaryTone, string> = {
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
};

const stickySelectHeaderClass = "md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickySelectCellClass = "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950";
const stickyNameHeaderClass =
  "md:sticky md:z-40 md:border-r md:border-slate-200 md:bg-slate-100 md:dark:border-neutral-800 md:dark:bg-neutral-800";
const stickyNameCellClass =
  "font-medium md:sticky md:z-30 md:border-r md:border-slate-200 md:bg-white md:dark:border-neutral-800 md:dark:bg-neutral-950";
const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:border-l md:border-slate-200 md:bg-slate-100 md:dark:border-neutral-800 md:dark:bg-neutral-800";
const stickyActionsCellClass =
  "md:sticky md:z-30 md:border-l md:border-slate-200 md:bg-white md:dark:border-neutral-800 md:dark:bg-neutral-950";

function ApiKeyBadge({ value }: { value: string }) {
  return (
    <OverflowTooltip as="div" content={value} className="block min-w-0 max-w-full">
      <code className="inline-flex min-w-0 max-w-full items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
        <span className="block min-w-0 truncate">{value}</span>
      </code>
    </OverflowTooltip>
  );
}

function ApiKeyPermissionSummary({
  count,
  firstValue,
  tone,
  tooltipContent,
}: {
  count: number;
  firstValue: string;
  tone: PermissionSummaryTone;
  tooltipContent: ReactNode;
}) {
  return (
    <HoverTooltip content={tooltipContent} className="!flex min-w-0 max-w-full">
      <span
        className={`flex min-w-0 max-w-full items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-1.5 text-xs ${permissionSummaryToneClasses[tone]}`}
      >
        <span
          className={`inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 font-semibold tabular-nums ${permissionCountToneClasses[tone]}`}
        >
          {count}
        </span>
        <span className="block min-w-0 flex-1 truncate font-mono text-[11px] leading-5">
          {firstValue}
        </span>
      </span>
    </HoverTooltip>
  );
}

export const createApiKeyColumns = ({
  t,
  selectedKeys,
  allRowsSelected,
  someRowsSelected,
  onSelectAll,
  onSelectRow,
  onToggleDisable,
  onViewUsage,
  onCopy,
  onImportToCcSwitch,
  onEdit,
  onDelete,
}: CreateApiKeyColumnsOptions): DataTableColumn<ApiKeyEntry>[] => [
  {
    key: "select",
    label: t("api_keys_page.select_all_keys"),
    width: "w-12 min-w-12",
    lockOrder: "start",
    headerClassName: stickySelectHeaderClass,
    cellClassName: stickySelectCellClass,
    headerRender: () => (
      <Checkbox
        checked={allRowsSelected}
        indeterminate={someRowsSelected}
        onCheckedChange={onSelectAll}
        aria-label={t("api_keys_page.select_all_keys")}
      />
    ),
    render: (row) => (
      <Checkbox
        checked={selectedKeys.has(row.key)}
        onCheckedChange={(checked) => onSelectRow(row.key, checked)}
        aria-label={t("api_keys_page.select_key", {
          name: row.name || t("api_keys_page.unnamed"),
        })}
      />
    ),
  },
  {
    key: "name",
    label: t("api_keys_page.col_name"),
    width: "w-[120px] min-w-[120px]",
    lockOrder: "start",
    headerClassName: stickyNameHeaderClass,
    cellClassName: stickyNameCellClass,
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
    render: (row) => <ApiKeyBadge value={maskApiKey(row.key)} />,
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
    key: "spendingLimit",
    label: t("api_keys_page.col_spending_limit"),
    width: "w-[148px] min-w-[148px]",
    cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
    headerRender: () => (
      <HoverTooltip
        content={t("api_keys_page.spending_limit_help")}
        className="inline-flex items-center gap-1"
      >
        <span>{t("api_keys_page.col_spending_limit")}</span>
        <Info size={12} className="text-slate-400 dark:text-white/40" />
      </HoverTooltip>
    ),
    render: (row) => (
      <span className="inline-flex items-center gap-1">
        {!row["spending-limit"] ? (
          <>
            <InfinityIcon size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}
          </>
        ) : (
          formatApiKeySpendingLimit(row["spending-limit"])
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
        <ApiKeyPermissionSummary
          count={row["allowed-models"].length}
          firstValue={row["allowed-models"][0]}
          tone="indigo"
          tooltipContent={
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
        />
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
        <ApiKeyPermissionSummary
          count={row["allowed-channel-groups"].length}
          firstValue={row["allowed-channel-groups"][0]}
          tone="violet"
          tooltipContent={
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
        />
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
        <ApiKeyPermissionSummary
          count={row["allowed-channels"].length}
          firstValue={row["allowed-channels"][0]}
          tone="cyan"
          tooltipContent={
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
        />
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
    width: "w-[224px] min-w-[224px]",
    lockOrder: "end",
    headerClassName: stickyActionsHeaderClass,
    cellClassName: stickyActionsCellClass,
    render: (row, idx) => {
      const toggleLabel = row.disabled
        ? t("api_keys_page.click_enable")
        : t("api_keys_page.click_disable");
      const viewUsageLabel = t("api_keys_page.view_usage");
      const copyKeyLabel = t("api_keys_page.copy_key");
      const importLabel = t("ccswitch.import_to_ccswitch");
      const editLabel = t("common.edit");
      const deleteLabel = t("common.delete");

      return (
        <div className="flex items-center justify-center gap-1.5">
          <HoverTooltip content={toggleLabel}>
            <button
              type="button"
              onClick={() => onToggleDisable(idx)}
              className={`rounded-lg p-1.5 transition-colors ${
                row.disabled
                  ? "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  : "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              }`}
              aria-label={toggleLabel}
            >
              <Power size={15} />
            </button>
          </HoverTooltip>
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
