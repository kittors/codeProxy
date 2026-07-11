import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Edit3, Trash2 } from "lucide-react";
import { Button, Checkbox, OverflowTooltip, type DataTableColumn } from "@code-proxy/ui";
import { ModelCapabilityBadges } from "../components/ModelCapabilityBadges";
import { ModelVendorIcon as VendorIcon } from "../components/ModelVendorIcon";
import { formatPrice, hasModelPricingData as hasPricing } from "../modelsUtils";
import type { ModelItem } from "../types";

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
        width: "w-32",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => {
          const priced = hasPricing(row);
          return (
            <span
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold",
                row.enabled && priced
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-white/40",
              ].join(" ")}
            >
              {row.enabled && priced ? <Check size={10} /> : null}
              {row.enabled
                ? priced
                  ? t("models_page.priced")
                  : t("models_page.not_priced")
                : t("models_page.disabled")}
            </span>
          );
        },
      },
      {
        key: "actions",
        label: t("models_page.col_actions"),
        width: "w-24",
        render: (row) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onEditModel(row.id)}
              aria-label={t("models_page.edit_model_aria", { model: row.id })}
              title={t("models_page.edit_model_aria", { model: row.id })}
            >
              <Edit3 size={14} />
            </Button>
            {canDeleteModels ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onDeleteModel(row)}
                aria-label={t("models_page.delete_model_aria", { model: row.id })}
                title={t("models_page.delete_model_aria", { model: row.id })}
              >
                <Trash2 size={14} />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [
      allVisibleModelsSelected,
      canDeleteModels,
      onDeleteModel,
      onEditModel,
      onSelectModel,
      onSelectVisibleModels,
      selectedModelIds,
      someVisibleModelsSelected,
      t,
      visibleModelCount,
    ],
  );
}
