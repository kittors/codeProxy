import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Edit3, FlaskConical, Power, Trash2 } from "lucide-react";
import { Checkbox, HoverTooltip, OverflowTooltip, type DataTableColumn } from "@code-proxy/ui";
import { ModelCapabilityBadges } from "../components/ModelCapabilityBadges";
import { ModelVendorIcon as VendorIcon } from "../components/ModelVendorIcon";
import { formatPrice } from "../modelsUtils";
import type { ModelItem } from "../types";

const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950";

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
              width: "w-12",
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
                  <span className="block min-w-0 truncate text-xs text-slate-500 dark:text-white/45">
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
        width: "w-32",
        render: (row) => row.owned_by || "-",
      },
      {
        key: "capabilities",
        label: t("models_page.col_capabilities"),
        width: "w-40",
        render: (row) => <ModelCapabilityBadges model={row} />,
      },
      {
        key: "mode",
        label: t("models_page.col_pricing_mode"),
        width: "w-36",
        render: (row) =>
          row.pricing.mode === "call" ? t("models_page.mode_call") : t("models_page.mode_token"),
      },
      {
        key: "price",
        label: t("models_page.col_price"),
        width: "w-52",
        cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (row) => formatPrice(row, t("models_page.not_priced")),
      },
      {
        key: "status",
        label: t("models_page.col_status"),
        width: "w-28",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <span
            className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold",
              row.enabled
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-white/40",
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
        width: onToggleEnabled || onTestModel ? "w-[168px] min-w-[168px]" : "w-24",
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
            <div className="flex items-center justify-center gap-1.5">
              {onToggleEnabled ? (
                <HoverTooltip content={toggleLabel}>
                  <button
                    type="button"
                    onClick={() => onToggleEnabled(row)}
                    disabled={isToggling}
                    className={`rounded-lg p-1.5 transition-colors ${
                      row.enabled
                        ? "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        : "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    } ${isToggling ? "opacity-50" : ""}`}
                    aria-label={toggleLabel}
                  >
                    <Power size={15} />
                  </button>
                </HoverTooltip>
              ) : null}
              {onTestModel ? (
                <HoverTooltip content={testLabel}>
                  <button
                    type="button"
                    onClick={() => onTestModel(row)}
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-sky-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-sky-400"
                    aria-label={testLabel}
                  >
                    <FlaskConical size={15} />
                  </button>
                </HoverTooltip>
              ) : null}
              <HoverTooltip content={editLabel}>
                <button
                  type="button"
                  onClick={() => onEditModel(row.id)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                  aria-label={editLabel}
                >
                  <Edit3 size={15} />
                </button>
              </HoverTooltip>
              {canDeleteModels ? (
                <HoverTooltip content={deleteLabel}>
                  <button
                    type="button"
                    onClick={() => onDeleteModel(row)}
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-rose-400"
                    aria-label={deleteLabel}
                  >
                    <Trash2 size={15} />
                  </button>
                </HoverTooltip>
              ) : null}
            </div>
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
