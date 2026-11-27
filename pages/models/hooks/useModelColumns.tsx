import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Edit3, FlaskConical, Power, Trash2 } from "@code-proxy/ui/icons";
import {
  GRID_ROW_ACTIONS_COLUMN,
  GRID_WIDTH,
  GridRowActions,
  OverflowTooltip,
  type DataGridColumn,
} from "@code-proxy/ui";
import { ModelOwnerTag } from "@features/model-tags";
import { ModelCapabilityBadges } from "../components/ModelCapabilityBadges";
import { ModelVendorIcon as VendorIcon } from "../components/ModelVendorIcon";
import { formatPrice } from "../modelsUtils";
import type { ModelItem } from "../types";

/**
 * 模型库 / 模型配置两张表共用的列。勾选（批量删除）不在这里：表格自己的复选框列负责，
 * 表头全选只管当前可见的行（见 ModelsPage 的 selectable）。
 */
interface UseModelColumnsOptions {
  canDeleteModels: boolean;
  onEditModel: (modelId: string) => void;
  onDeleteModel: (model: ModelItem) => void;
  onToggleEnabled?: (model: ModelItem) => void;
  onTestModel?: (model: ModelItem) => void;
  togglingModelId?: string | null;
}

export function useModelColumns({
  canDeleteModels,
  onEditModel,
  onDeleteModel,
  onToggleEnabled,
  onTestModel,
  togglingModelId = null,
}: UseModelColumnsOptions): DataGridColumn<ModelItem>[] {
  const { t } = useTranslation();

  return useMemo<DataGridColumn<ModelItem>[]>(
    () => [
      {
        id: "model",
        header: t("models_page.col_model"),
        // 主文字列：吸收宽屏多出来的宽度，窄屏不小于 240。
        width: 352,
        minWidth: 240,
        grow: true,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={row.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={row.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{row.id}</span>
              </OverflowTooltip>
              {row.description ? (
                <OverflowTooltip content={row.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-xs text-sn-label3">
                    {row.description}
                  </span>
                </OverflowTooltip>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "owner",
        header: t("models_page.col_owner"),
        width: 128,
        // 归属标签 + 归属方 logo；标签配色（多彩风格下的品牌淡底）由 ModelOwnerTag 统一决定。
        cell: (row) => (row.owned_by ? <ModelOwnerTag owner={row.owned_by} withLogo /> : "-"),
      },
      {
        id: "capabilities",
        header: t("models_page.col_capabilities"),
        width: GRID_WIDTH.badgeStacked,
        cell: (row) => <ModelCapabilityBadges model={row} />,
      },
      {
        id: "mode",
        header: t("models_page.col_pricing_mode"),
        width: GRID_WIDTH.numericWide,
        cell: (row) =>
          row.pricing.mode === "call" ? t("models_page.mode_call") : t("models_page.mode_token"),
      },
      {
        id: "price",
        header: t("models_page.col_price"),
        width: GRID_WIDTH.name,
        className: "font-mono text-xs tabular-nums text-sn-label2",
        cell: (row) => formatPrice(row, t("models_page.not_priced")),
      },
      {
        id: "status",
        header: t("models_page.col_status"),
        width: GRID_WIDTH.badge,
        align: "center",
        cell: (row) => (
          <span
            className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold",
              row.enabled
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-sn-label/[0.05] text-sn-label3 dark:bg-white/[0.07]",
            ].join(" ")}
          >
            {row.enabled ? <Check size={10} /> : null}
            {row.enabled ? t("models_page.enabled") : t("models_page.disabled")}
          </span>
        ),
      },
      {
        id: "actions",
        header: t("models_page.col_actions"),
        ...GRID_ROW_ACTIONS_COLUMN,
        cell: (row) => {
          const toggleLabel = row.enabled
            ? t("models_page.click_disable")
            : t("models_page.click_enable");
          const testLabel = t("models_page.test_model_aria", { model: row.id });
          const editLabel = t("models_page.edit_model_aria", { model: row.id });
          const deleteLabel = t("models_page.delete_model_aria", { model: row.id });
          const isToggling = togglingModelId === row.id;

          return (
            <GridRowActions
              moreLabel={t("common.more_actions")}
              actions={[
                {
                  key: "toggle",
                  label: toggleLabel,
                  icon: <Power size={15} />,
                  visible: Boolean(onToggleEnabled),
                  disabled: isToggling,
                  // 简约风格下用共享 ghost 按钮的中性墨色（启用状态看「状态」列）；
                  // 多彩风格下启用中的开关是绿色，停用的开关悬停时提示红色。
                  className: row.enabled
                    ? "colorful:text-emerald-500 colorful:hover:bg-emerald-50 colorful:dark:text-emerald-400 colorful:dark:hover:bg-emerald-900/20"
                    : "colorful:hover:bg-red-50 colorful:hover:text-red-500 colorful:dark:hover:bg-red-900/20 colorful:dark:hover:text-red-400",
                  onClick: () => onToggleEnabled?.(row),
                },
                {
                  key: "test",
                  label: testLabel,
                  icon: <FlaskConical size={15} />,
                  visible: Boolean(onTestModel),
                  className: "icon-hue:hover:text-sky-600 icon-hue:dark:hover:text-sky-400",
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
    [canDeleteModels, onDeleteModel, onEditModel, onTestModel, onToggleEnabled, t, togglingModelId],
  );
}
