import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Edit3, FlaskConical, Power, Trash2 } from "lucide-react";
import {
  COLUMN_WIDTH,
  Checkbox,
  OverflowTooltip,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  type DataTableColumn,
} from "@code-proxy/ui";
import { ModelOwnerTag } from "@features/model-tags";
import { ModelCapabilityBadges } from "../components/ModelCapabilityBadges";
import { ModelVendorIcon as VendorIcon } from "../components/ModelVendorIcon";
import { formatPrice } from "../modelsUtils";
import type { ModelItem } from "../types";

const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-backdrop";

interface UseModelColumnsOptions {
  canDeleteModels: boolean;
  allVisibleModelsSelected: boolean;
  someVisibleModelsSelected: boolean;
  visibleModelCount: number;
  selectedModelIds: Set<string>;
  onSelectModel: (modelId: string, checked: boolean) => void;
  onSelectVisibleModels: (checked: boolean) => void;
  onEditModel: (modelId: string) => void;
  onDeleteModel: (model: ModelItem) => void;
  onToggleEnabled?: (model: ModelItem) => void;
  onTestModel?: (model: ModelItem) => void;
  togglingModelId?: string | null;
}

export function useModelColumns({
  canDeleteModels,
  allVisibleModelsSelected,
  someVisibleModelsSelected,
  visibleModelCount,
  selectedModelIds,
  onSelectModel,
  onSelectVisibleModels,
  onEditModel,
  onDeleteModel,
  onToggleEnabled,
  onTestModel,
  togglingModelId = null,
}: UseModelColumnsOptions): DataTableColumn<ModelItem>[] {
  const { t } = useTranslation();

  return useMemo<DataTableColumn<ModelItem>[]>(
    () => [
      ...(canDeleteModels
        ? [
            {
              key: "select",
              label: "",
              width: COLUMN_WIDTH.checkbox,
              headerClassName: "text-center",
              cellClassName: "text-center",
              headerRender: () => (
                <Checkbox
                  aria-label={t("models_page.select_all_visible_models")}
                  checked={allVisibleModelsSelected}
                  indeterminate={someVisibleModelsSelected && !allVisibleModelsSelected}
                  disabled={visibleModelCount === 0}
                  onCheckedChange={onSelectVisibleModels}
                />
              ),
              render: (row) => (
                <Checkbox
                  aria-label={t("models_page.select_model_aria", { model: row.id })}
                  checked={selectedModelIds.has(row.id)}
                  onCheckedChange={(checked) => onSelectModel(row.id, checked)}
                />
              ),
            } satisfies DataTableColumn<ModelItem>,
          ]
        : []),
      {
        key: "model",
        label: t("models_page.col_model"),
        width: "w-[22rem]",
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={row.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={row.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{row.id}</span>
              </OverflowTooltip>
              {row.description ? (
                <OverflowTooltip content={row.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-xs text-ink-3">
                    {row.description}
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
        width: COLUMN_WIDTH.compact,
        // 归属是中性标签 + 归属方 logo：认人靠 logo，标签不再按品牌上色。
        render: (row) => (row.owned_by ? <ModelOwnerTag owner={row.owned_by} withLogo /> : "-"),
      },
      {
        key: "capabilities",
        label: t("models_page.col_capabilities"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (row) => <ModelCapabilityBadges model={row} />,
      },
      {
        key: "mode",
        label: t("models_page.col_pricing_mode"),
        width: COLUMN_WIDTH.numericWide,
        render: (row) =>
          row.pricing.mode === "call" ? t("models_page.mode_call") : t("models_page.mode_token"),
      },
      {
        key: "price",
        label: t("models_page.col_price"),
        width: COLUMN_WIDTH.name,
        cellClassName: "font-mono text-xs tabular-nums text-ink-2",
        render: (row) => formatPrice(row, t("models_page.not_priced")),
      },
      {
        key: "status",
        label: t("models_page.col_status"),
        width: COLUMN_WIDTH.badge,
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <span
            className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold",
              row.enabled
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
            ].join(" ")}
          >
            {row.enabled ? <Check size={10} /> : null}
            {row.enabled ? t("models_page.enabled") : t("models_page.disabled")}
          </span>
        ),
      },
      {
        key: "actions",
        label: t("models_page.col_actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        headerClassName: stickyActionsHeaderClass,
        cellClassName: stickyActionsCellClass,
        render: (row) => {
          const toggleLabel = row.enabled
            ? t("models_page.click_disable")
            : t("models_page.click_enable");
          const testLabel = t("models_page.test_model_aria", { model: row.id });
          const editLabel = t("models_page.edit_model_aria", { model: row.id });
          const deleteLabel = t("models_page.delete_model_aria", { model: row.id });
          const isToggling = togglingModelId === row.id;

          return (
            <TableRowActions
              moreLabel={t("common.more_actions")}
              actions={[
                {
                  key: "toggle",
                  label: toggleLabel,
                  icon: <Power size={15} />,
                  visible: Boolean(onToggleEnabled),
                  disabled: isToggling,
                  // 行内操作图标一律用共享 ghost 按钮的中性墨色：启用状态看「状态」列，不靠图标染绿。
                  onClick: () => onToggleEnabled?.(row),
                },
                {
                  key: "test",
                  label: testLabel,
                  icon: <FlaskConical size={15} />,
                  visible: Boolean(onTestModel),
                  onClick: () => onTestModel?.(row),
                },
                {
                  key: "edit",
                  label: editLabel,
                  icon: <Edit3 size={15} />,
                  onClick: () => onEditModel(row.id),
                },
                {
                  key: "delete",
                  label: deleteLabel,
                  icon: <Trash2 size={15} />,
                  visible: canDeleteModels,
                  destructive: true,
                  onClick: () => onDeleteModel(row),
                },
              ]}
            />
          );
        },
      },
    ],
    [
      allVisibleModelsSelected,
      canDeleteModels,
      onDeleteModel,
      onEditModel,
      onSelectModel,
      onSelectVisibleModels,
      onTestModel,
      onToggleEnabled,
      selectedModelIds,
      someVisibleModelsSelected,
      t,
      togglingModelId,
      visibleModelCount,
    ],
  );
}
