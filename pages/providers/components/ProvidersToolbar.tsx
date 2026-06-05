import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare, Download, Plus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@code-proxy/ui";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export type ProvidersToolbarProps = {
  currentImportKind: string | null;
  currentTabItemsCount: number;
  selectedExportCount: number;
  allCurrentSelected: boolean;
  loading: boolean;
  onImportClick: () => void;
  onExport: () => void;
  onExportSelected: () => void;
  onSelectAll: (checked: boolean) => void;
  onRefresh: () => void;
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
  onImportClick,
  onExport,
  onExportSelected,
  onSelectAll,
  onRefresh,
  onAddCurrent,
}: ProvidersToolbarProps) {
  const { t } = useTranslation();
  const hasImportExport = currentImportKind !== null;
  const hasSelection = selectedExportCount > 0;

  return (
    <div
      data-testid="providers-batch-actions"
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50/80 px-2 py-1.5 transition-colors duration-200 ease-out dark:bg-white/3"
    >
      {/* Left group: import/export/select/refresh */}
      <div className="flex flex-wrap items-center gap-1">
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

            <Button
              variant="secondary"
              size="sm"
              className="relative h-8! px-2 text-xs"
              onClick={() => onSelectAll(!allCurrentSelected)}
              disabled={currentTabItemsCount === 0}
            >
              <CheckSquare size={14} />
              {allCurrentSelected
                ? t("providers.batch_deselect_all")
                : t("providers.batch_select_all")}
              {hasSelection ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">
                  {selectedExportCount}
                </span>
              ) : null}
            </Button>
          </>
        ) : null}

        {onAddCurrent ? (
          <Button variant="primary" size="sm" className="h-8! px-3 text-xs" onClick={onAddCurrent}>
            <Plus size={14} />
            {t("providers.add_new")}
          </Button>
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
      </div>
    </div>
  );
}
