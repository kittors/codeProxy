import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Search, ShieldCheck } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import type { AuthFileModelItem } from "@/modules/auth-files/helpers/authFilesPageUtils";

interface ImportModelsModalProps {
  open: boolean;
  importChannel: string;
  importLoading: boolean;
  importModels: AuthFileModelItem[];
  importFilteredModels: AuthFileModelItem[];
  importSearch: string;
  setImportSearch: Dispatch<SetStateAction<string>>;
  importSelected: Set<string>;
  setImportSelected: Dispatch<SetStateAction<Set<string>>>;
  setImportOpen: Dispatch<SetStateAction<boolean>>;
  applyImport: () => void;
}

export function ImportModelsModal({
  open,
  importChannel,
  importLoading,
  importModels,
  importFilteredModels,
  importSearch,
  setImportSearch,
  importSelected,
  setImportSelected,
  setImportOpen,
  applyImport,
}: ImportModelsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      title={t("auth_files.import_title", { name: importChannel || "--" })}
      description={t("auth_files.fetch_models_desc")}
      onClose={() => setImportOpen(false)}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(false)}>
            {t("auth_files.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={applyImport}
            disabled={importLoading || !importModels.length}
          >
            <ShieldCheck size={14} />
            {t("auth_files.import_selected")}
          </Button>
        </div>
      }
    >
      {importLoading ? (
        <div className="text-sm text-slate-600 dark:text-white/65">
          {t("common.loading_ellipsis")}
        </div>
      ) : importModels.length === 0 ? (
        <EmptyState
          title={t("common.no_model_def")}
          description={t("auth_files_page.cannot_edit_desc")}
        />
      ) : (
        <div className="space-y-3">
          <TextInput
            value={importSearch}
            onChange={(e) => setImportSearch(e.currentTarget.value)}
            placeholder={t("auth_files.search_models_placeholder")}
            endAdornment={<Search size={16} className="text-slate-400" />}
          />

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
              {t("auth_files.models_selected", {
                models: importFilteredModels.length,
                selected: importSelected.size,
              })}
            </p>
            <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
              {importFilteredModels.map((model) => {
                const checked = importSelected.has(model.id);
                return (
                  <label
                    key={model.id}
                    className={
                      checked
                        ? "flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-2 py-1 text-xs font-mono text-white dark:bg-white dark:text-neutral-950"
                        : "flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-xs font-mono hover:bg-slate-50 dark:hover:bg-white/5"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setImportSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(model.id)) next.delete(model.id);
                          else next.add(model.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
                    />
                    <span className="truncate">{model.id}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
