import type { TFunction } from "i18next";
import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { maskApiKey } from "@/modules/api-keys/apiKeyPageUtils";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";

type DeleteApiKeyModalProps = {
  t: TFunction;
  entry: ApiKeyEntry | null;
  open: boolean;
  saving: boolean;
  deleteLogsOnDelete: boolean;
  onDeleteLogsChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteApiKeyModal({
  t,
  entry,
  open,
  saving,
  deleteLogsOnDelete,
  onDeleteLogsChange,
  onClose,
  onConfirm,
}: DeleteApiKeyModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("api_keys_page.confirm_delete")}
      description={t("api_keys_page.delete_warning")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("api_keys_page.cancel")}
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()} disabled={saving}>
            {saving ? t("api_keys_page.deleting") : t("api_keys_page.confirm_delete_btn")}
          </Button>
        </>
      }
    >
      {entry ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
            <div className="text-sm font-medium text-red-800 dark:text-red-300">
              {entry.name || t("api_keys_page.unnamed")}
            </div>
            <code className="text-xs text-red-600 dark:text-red-400">{maskApiKey(entry.key)}</code>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/75">
            <input
              type="checkbox"
              checked={deleteLogsOnDelete}
              onChange={(event) => onDeleteLogsChange(event.currentTarget.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-400/30 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <span>{t("api_keys_page.delete_logs_option")}</span>
          </label>
        </div>
      ) : null}
    </Modal>
  );
}
