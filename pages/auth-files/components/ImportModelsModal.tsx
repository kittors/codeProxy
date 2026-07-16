import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Search, ShieldCheck } from "lucide-react";
import { Button, Checkbox, EmptyState, Modal, TextInput } from "@code-proxy/ui";
import type { AuthFileModelItem } from "@code-proxy/domain";

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

function toggleModelId(prev: Set<string>, modelId: string): Set<string> {
  const next = new Set(prev);
  if (next.has(modelId)) next.delete(modelId);
  else next.add(modelId);
  return next;
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
            <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
              {importFilteredModels.map((model) => {
                const checked = importSelected.has(model.id);
                return (
                  <label
                    key={model.id}
                    className={[
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
                      "hover:bg-[#EBEBEC] dark:hover:bg-[#46464C]",
                      checked
                        ? "bg-slate-100 font-medium text-[#18181B] dark:bg-white/10 dark:text-white"
                        : "font-normal text-[#18181B] dark:text-[#9F9FA8]",
                    ].join(" ")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setImportSelected((prev) => toggleModelId(prev, model.id));
                      }}
                      className="shrink-0"
                      aria-label={model.id}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{model.id}</span>
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
