import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare, Download, LayoutGrid, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Select } from "@/modules/ui/Select";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export type ProvidersToolbarProps = {
  currentImportKind: string | null;
  currentTabItemsCount: number;
  selectedExportCount: number;
  allCurrentSelected: boolean;
  loading: boolean;
  gridColumns: number;
  onImportClick: () => void;
  onExport: () => void;
  onExportSelected: () => void;
  onSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onRefresh: () => void;
  onGridColumnsChange: (cols: number) => void;
  onAddCurrent: (() => void) | null;
  addLabel?: string;
  children?: ReactNode;
};

const DROPDOWN_CONTENT =
  "z-[220] min-w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/35";
const DROPDOWN_ITEM =
  "flex w-full cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none transition-colors focus:bg-slate-100 data-[highlighted]:bg-slate-100 dark:text-white/75 dark:focus:bg-white/10 dark:data-[highlighted]:bg-white/10";

export function ProvidersToolbar({
  currentImportKind,
  currentTabItemsCount,
  selectedExportCount,
  allCurrentSelected,
  loading,
  gridColumns,
  onImportClick,
  onExport,
  onExportSelected,
  onSelectAll,
  onClearSelection,
  onRefresh,
  onGridColumnsChange,
}: ProvidersToolbarProps) {
  const { t } = useTranslation();
  const hasImportExport = currentImportKind !== null;
  const hasSelection = selectedExportCount > 0;

  return (
    <div
      data-testid="providers-batch-actions"
      className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-50/80 px-2 py-1.5 transition-colors duration-200 ease-out dark:bg-white/3"
    >
      {hasImportExport ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="h-8! px-2 text-xs"
            onClick={onImportClick}
          >
            <Upload size={14} />
            {t("providers.import_json")}
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-8! px-2 text-xs"
                disabled={currentTabItemsCount === 0}
              >
                <Download size={14} />
                {t("providers.export_json")}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={6} className={DROPDOWN_CONTENT}>
                <DropdownMenu.Item className={DROPDOWN_ITEM} onSelect={() => onExport()}>
                  {t("providers.export_json")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={DROPDOWN_ITEM}
                  onSelect={() => onExportSelected()}
                  disabled={selectedExportCount === 0}
                >
                  {t("providers.export_selected_json")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8! px-2 text-xs"
              onClick={() => onSelectAll(!allCurrentSelected)}
              disabled={currentTabItemsCount === 0}
            >
              <CheckSquare size={14} />
              {allCurrentSelected
                ? t("providers.batch_deselect_all")
                : t("providers.batch_select_all")}
            </Button>
            {hasSelection ? (
              <>
                <span className="text-xs tabular-nums text-slate-500 dark:text-white/55">
                  {selectedExportCount}
                </span>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="inline-flex items-center rounded px-1 py-0.5 text-xs text-slate-400 transition-colors hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
                  aria-label={t("providers.batch_clear")}
                >
                  ✕
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        className="h-8! px-2 text-xs"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {t("providers.refresh")}
      </Button>

      <div className="ml-auto flex items-center gap-1.5">
        <LayoutGrid size={14} className="text-slate-500 dark:text-white/50" />
        <Select
          value={String(gridColumns)}
          onChange={(v) => onGridColumnsChange(Number(v))}
          options={[
            { value: "1", label: t("providers.grid_cols_1") },
            { value: "2", label: t("providers.grid_cols_2") },
            { value: "3", label: t("providers.grid_cols_3") },
            { value: "4", label: t("providers.grid_cols_4") },
          ]}
          size="sm"
          aria-label={t("providers.grid_columns_aria")}
        />
      </div>
    </div>
  );
}
