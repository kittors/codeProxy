import type { ReactNode } from "react";
import { ListChecks } from "lucide-react";
import { DropdownMenu, buttonClassName } from "@code-proxy/ui";
import type { TFunction } from "i18next";

interface AuthFilesSelectionActionsMenuProps {
  show: boolean;
  t: TFunction;
  selectablePageNamesLength: number;
  allPageSelected: boolean;
  selectCurrentPage: (checked: boolean) => void;
  selectableFilteredFilesLength: number;
  allFilteredSelected: boolean;
  selectFilteredFiles: (checked: boolean) => void;
}

export function AuthFilesSelectionActionsMenu({
  show,
  t,
  selectablePageNamesLength,
  allPageSelected,
  selectCurrentPage,
  selectableFilteredFilesLength,
  allFilteredSelected,
  selectFilteredFiles,
}: AuthFilesSelectionActionsMenuProps): ReactNode {
  if (!show) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={buttonClassName({
            variant: "secondary",
            size: "sm",
            iconOnly: true,
          })}
          aria-label={t("auth_files.selection_actions")}
          title={t("auth_files.selection_actions")}
          data-tooltip-placement="top"
        >
          <ListChecks size={15} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="min-w-44">
          <DropdownMenu.Item
            disabled={selectablePageNamesLength === 0}
            onSelect={() => selectCurrentPage(!allPageSelected)}
          >
            <ListChecks size={15} />
            <span>
              {allPageSelected
                ? t("auth_files.batch_deselect_page")
                : t("auth_files.batch_select_page")}
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={selectableFilteredFilesLength === 0}
            onSelect={() => selectFilteredFiles(!allFilteredSelected)}
          >
            <ListChecks size={15} />
            <span>
              {allFilteredSelected
                ? t("auth_files.batch_deselect_filtered")
                : t("auth_files.batch_select_filtered")}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
