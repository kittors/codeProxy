import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, COLUMN_WIDTH, surface } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
import { VendorIcon } from "@code-proxy/assets";
import { emptyModelPricing, formatModelPrice } from "@features/model-availability";
import type { RoutingModelOption } from "./types";
import type { ModelSelectionDraft } from "./modelSelectionDraft";

export type ModelSelectionPanelProps = {
  selection: ModelSelectionDraft;
  modelOptions: RoutingModelOption[];
  selectedModelIds: Set<string>;
  /** Models the group's channels serve but the selection leaves out. */
  unselectedModelCount: number;
  modelsLoading: boolean;
  modelsError: string;
  /** The group matches no channel yet, so there is nothing to list. */
  needsChannels: boolean;
  disabled?: boolean;
  onToggleModel: (modelId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggleAutoAllowNewModels: (next: boolean) => void;
};

export function ModelSelectionPanel({
  selection,
  modelOptions,
  selectedModelIds,
  unselectedModelCount,
  modelsLoading,
  modelsError,
  needsChannels,
  disabled,
  onToggleModel,
  onSelectAll,
  onClearAll,
  onToggleAutoAllowNewModels,
}: ModelSelectionPanelProps) {
  const { t } = useTranslation();

  const modelOptionIds = useMemo(() => modelOptions.map((model) => model.id), [modelOptions]);
  const selectedVisibleCount = modelOptionIds.filter((model) => selectedModelIds.has(model)).length;
  const allSelected = modelOptionIds.length > 0 && selectedVisibleCount === modelOptionIds.length;
  const someSelected = selectedVisibleCount > 0 && selectedVisibleCount < modelOptionIds.length;

  const columns = useMemo<DataTableColumn<RoutingModelOption>[]>(
    () => [
      {
        key: "select",
        label: "",
        width: COLUMN_WIDTH.checkbox,
        headerClassName: "text-center",
        cellClassName: "text-center",
        headerRender: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            disabled={disabled || modelOptions.length === 0}
            onCheckedChange={(checked) => {
              if (checked) onSelectAll();
              else onClearAll();
            }}
            aria-label={t("channel_groups_page.allowed_models_label")}
          />
        ),
        render: (model) => (
          <Checkbox
            checked={selectedModelIds.has(model.id)}
            onCheckedChange={(checked) => onToggleModel(model.id, checked)}
            disabled={disabled}
            aria-label={model.id}
          />
        ),
      },
      {
        key: "model",
        label: t("models_page.col_model"),
        width: "w-[28rem]",
        minWidthPx: 220,
        maxWidthPx: 640,
        cellClassName: "min-w-0",
        render: (model) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={model.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={model.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{model.id}</span>
              </OverflowTooltip>
              {model.description ? (
                <OverflowTooltip content={model.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-xs text-slate-500 dark:text-white/45">
                    {model.description}
                  </span>
                </OverflowTooltip>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        key: "owner",
        label: t("models_page.col_owner"),
        width: COLUMN_WIDTH.numericWide,
        minWidthPx: 120,
        maxWidthPx: 360,
        cellClassName: "min-w-0 whitespace-nowrap text-slate-600 dark:text-white/60",
        render: (model) => model.owned_by || "-",
        overflowTooltip: (model) => model.owned_by || "-",
      },
      {
        key: "price",
        label: t("models_page.col_price"),
        width: "w-56",
        minWidthPx: 180,
        maxWidthPx: 420,
        cellClassName:
          "whitespace-nowrap font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (model) =>
          formatModelPrice(model.pricing ?? emptyModelPricing(), t("models_page.not_priced")),
      },
    ],
    [
      allSelected,
      disabled,
      modelOptions.length,
      onClearAll,
      onSelectAll,
      onToggleModel,
      selectedModelIds,
      someSelected,
      t,
    ],
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("channel_groups_page.allowed_models_label")}
          </div>
          <div className="text-xs text-slate-500 dark:text-white/55">
            {t("channel_groups_page.allowed_models_hint")}
          </div>
        </div>
        <HoverTooltip
          content={t(
            selection.autoAllowNewModels
              ? "channel_groups_page.auto_allow_new_models_on_hint"
              : "channel_groups_page.auto_allow_new_models_off_hint",
          )}
        >
          <ToggleSwitch
            checked={selection.autoAllowNewModels}
            onCheckedChange={onToggleAutoAllowNewModels}
            disabled={disabled}
            label={t("channel_groups_page.auto_allow_new_models_label")}
          />
        </HoverTooltip>
      </div>

      {/* A group saved as an allow list before this switch existed can still be
          missing models the upstream has added since. Say so, and offer the
          one-click fix that turns the group into a pure follow-upstream group. */}
      {selection.autoAllowNewModels && unselectedModelCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200">
          <span>
            {t("channel_groups_page.auto_allow_new_models_gap", { total: unselectedModelCount })}
          </span>
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={disabled}>
            {t("channel_groups_page.auto_allow_new_models_include_all")}
          </Button>
        </div>
      ) : null}

      {needsChannels ? (
        <div
          className={[
            surface({ tone: "inset", radius: "2xl" }),
            "px-4 py-6 text-sm text-slate-500 dark:text-white/55",
          ].join(" ")}
        >
          {t("channel_groups_page.models_need_channels")}
        </div>
      ) : modelsError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
          {modelsError}
        </div>
      ) : (
        <div data-testid="group-editor-model-list" className="min-h-0 flex-1 -mx-5">
          <div data-testid="group-editor-model-list-content" className="h-full min-h-0 px-5">
            <DataTable<RoutingModelOption>
              tableId="routing-model-options-v2"
              rows={modelOptions}
              columns={columns}
              rowKey={(model) => model.id}
              loading={modelsLoading}
              virtualize={false}
              rowHeight={58}
              height="h-full"
              minHeight="min-h-[360px]"
              minWidth="min-w-[760px]"
              caption={t("channel_groups_page.allowed_models_label")}
              emptyText={t("channel_groups_page.no_channel_models")}
              showAllLoadedMessage={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
