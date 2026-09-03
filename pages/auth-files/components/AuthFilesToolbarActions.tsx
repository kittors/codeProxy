import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import {
  BarChart3,
  ClipboardPaste,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button, HoverTooltip, MaskToggleButton, Select } from "@code-proxy/ui";
import { AuthFilesQuotaSortMenu } from "./AuthFilesQuotaSortMenu";

export type AuthFilesToolbarActionsProps = {
  t: TFunction;
  masked: boolean;
  onToggleMask: () => void;
  onGroupOverview: () => void;
  groupOverviewLoading: boolean;
  onRefresh: () => void;
  refreshDisabled: boolean;
  refreshSpinning: boolean;
  onUpload: () => void;
  onPasteJson: () => void;
  onAddOAuth: () => void;
  uploading: boolean;
  configActionsMenu: ReactNode;
  showCardColumns: boolean;
  cardColumns: number;
  cardColumnOptions: { value: string; label: string }[];
  onCardColumnsChange: (value: string) => void;
};

/**
 * Right-hand action cluster of the auth-files toolbar.
 *
 * Extracted from AuthFilesFilesTab to keep that file under the size ratchet;
 * it is presentational and takes every side effect as a callback.
 */
export function AuthFilesToolbarActions({
  t,
  masked,
  onToggleMask,
  onGroupOverview,
  groupOverviewLoading,
  onRefresh,
  refreshDisabled,
  refreshSpinning,
  onUpload,
  onPasteJson,
  onAddOAuth,
  uploading,
  configActionsMenu,
  showCardColumns,
  cardColumns,
  cardColumnOptions,
  onCardColumnsChange,
}: AuthFilesToolbarActionsProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-full bg-slate-50/90 px-1.5 py-1 dark:bg-white/[0.04]">
      <MaskToggleButton masked={masked} onToggle={onToggleMask} />
      <HoverTooltip content={t("auth_files.group_overview_button")}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onGroupOverview}
          disabled={groupOverviewLoading}
          aria-label={t("auth_files.group_overview_button")}
          title={t("auth_files.group_overview_button")}
        >
          {groupOverviewLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <BarChart3 size={15} />
          )}
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t("auth_files.refresh")}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={refreshDisabled}
          aria-label={t("auth_files.refresh")}
          title={t("auth_files.refresh")}
        >
          <RefreshCw
            size={15}
            className={refreshSpinning ? "animate-spin" : ""}
          />
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t("auth_files.upload")}>
        <Button
          variant="primary"
          size="sm"
          onClick={onUpload}
          disabled={uploading}
          aria-label={t("auth_files.upload")}
          title={t("auth_files.upload")}
        >
          {uploading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Upload size={15} />
          )}
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t("auth_files.paste_json")}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onPasteJson}
          disabled={uploading}
          aria-label={t("auth_files.paste_json")}
          title={t("auth_files.paste_json")}
        >
          {uploading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ClipboardPaste size={15} />
          )}
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t("auth_files_page.add_oauth")}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onAddOAuth}
          aria-label={t("auth_files_page.add_oauth")}
          title={t("auth_files_page.add_oauth")}
        >
          <Plus size={15} />
        </Button>
      </HoverTooltip>
      {configActionsMenu}
      <AuthFilesQuotaSortMenu />
      {showCardColumns ? (
        <div
          className="hidden xl:block"
          data-testid="auth-files-card-columns"
        >
          <Select
            value={String(cardColumns)}
            onChange={onCardColumnsChange}
            options={cardColumnOptions}
            aria-label={t("auth_files.card_columns")}
            variant="chip"
            size="sm"
            className="min-w-[6.25rem]"
          />
        </div>
      ) : null}
    </div>
  );
}
