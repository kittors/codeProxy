import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleOff, Download, Power, Zap } from "lucide-react";
import { Button } from "@code-proxy/ui";

interface AuthFilesSelectionToolbarProps {
  selectedFileNames: string[];
  setSelectedFileNames: (names: string[]) => void;
  selectionActionsMenu: ReactNode;
  deletingAll: boolean;
  batchStatusUpdating: boolean;
  onSetSelectionDisabled: (names: string[], disabled: boolean) => void;
  onDeleteSelection: (names: string[]) => void;
  onDownloadSelection: (names: string[]) => void;
  onBatchWarmup?: (names: string[]) => void;
  batchWarmupBusy?: boolean;
}

/**
 * Batch bar for the selected auth files. Enable and disable both live here: a
 * bar that could only disable left accounts stranded, with no way back except
 * the per-card power button.
 */
export function AuthFilesSelectionToolbar({
  selectedFileNames,
  setSelectedFileNames,
  selectionActionsMenu,
  deletingAll,
  batchStatusUpdating,
  onSetSelectionDisabled,
  onDeleteSelection,
  onDownloadSelection,
  onBatchWarmup,
  batchWarmupBusy,
}: AuthFilesSelectionToolbarProps) {
  const { t } = useTranslation();
  const selectedCount = selectedFileNames.length;
  if (selectedCount === 0) return <>{selectionActionsMenu}</>;

  const busy = deletingAll || batchStatusUpdating;
  const names = () => [...selectedFileNames];

  return (
    <div className="inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 overflow-x-auto rounded-full bg-slate-50/90 px-1.5 text-xs transition-colors duration-200 ease-out dark:bg-white/[0.04]">
      {selectionActionsMenu}
      <span className="min-w-0 truncate px-1 font-medium text-slate-600 dark:text-white/65">
        {t("auth_files.batch_selected", { count: selectedCount })}
      </span>
      <Button variant="ghost" size="xs" className="px-2" onClick={() => setSelectedFileNames([])}>
        {t("auth_files.batch_clear")}
      </Button>
      <Button
        variant="secondary"
        size="xs"
        className="px-2"
        onClick={() => onSetSelectionDisabled(names(), false)}
        disabled={busy}
      >
        <Power size={13} className="shrink-0" />
        <span>{t("auth_files.batch_enable")}</span>
      </Button>
      <Button
        variant="secondary"
        size="xs"
        className="px-2"
        onClick={() => onSetSelectionDisabled(names(), true)}
        disabled={busy}
      >
        <CircleOff size={13} className="shrink-0" />
        <span>{t("auth_files.batch_disable")}</span>
      </Button>
      <Button
        variant="danger"
        size="xs"
        className="px-2"
        onClick={() => onDeleteSelection(names())}
        disabled={busy}
      >
        {t("auth_files.batch_delete_action", { count: selectedCount })}
      </Button>
      <Button
        variant="secondary"
        size="xs"
        className="px-2"
        onClick={() => onDownloadSelection(names())}
        disabled={busy}
      >
        <Download size={13} className="shrink-0" />
        <span>{t("auth_files.batch_download_action", { count: selectedCount })}</span>
      </Button>
      {onBatchWarmup ? (
        <Button
          variant="secondary"
          size="xs"
          className="px-2 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          onClick={() => onBatchWarmup(names())}
          disabled={busy || batchWarmupBusy}
        >
          <Zap size={13} className="shrink-0" />
          <span>{t("antigravity_quota.warmup_batch_button", { count: selectedCount })}</span>
        </Button>
      ) : null}
    </div>
  );
}
