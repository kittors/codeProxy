import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Check, ListPlus, Search } from "lucide-react";
import { Button, Checkbox, EmptyState, Modal, Skeleton, TextInput } from "@code-proxy/ui";
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

/**
 * 给别名渠道导入模型：搜索 → 勾选 → 导入。
 *
 * 「全选 / 全不选」只作用于当前搜索结果（先搜 gemini 再全选是最常见的用法）；
 * 底部左侧始终显示已选几个，一个都没选时「导入已选」不可点。
 */
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
  const visibleIds = importFilteredModels.map((model) => model.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => importSelected.has(id));

  const toggleAllVisible = () => {
    setImportSelected((previous) => {
      const next = new Set(previous);
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  return (
    <Modal
      open={open}
      title={t("auth_files.import_title", { name: importChannel || "--" })}
      description={t("auth_files.fetch_models_desc")}
      icon={<ListPlus />}
      size="md"
      onClose={() => setImportOpen(false)}
      footerStart={
        importModels.length ? (
          <span className="tabular-nums">
            {t("auth_files.models_selected", {
              models: importFilteredModels.length,
              selected: importSelected.size,
            })}
          </span>
        ) : null
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => setImportOpen(false)}>
            {t("auth_files.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={applyImport}
            disabled={importLoading || importSelected.size === 0}
          >
            <Check size={15} aria-hidden="true" />
            {t("auth_files.import_selected")}
          </Button>
        </>
      }
    >
      {importLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-9 rounded-full" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-8 rounded-lg" />
          ))}
        </div>
      ) : importModels.length === 0 ? (
        <EmptyState
          title={t("common.no_model_def")}
          description={t("auth_files.import_empty_desc")}
        />
      ) : (
        <div className="space-y-3">
          <TextInput
            value={importSearch}
            onChange={(e) => setImportSearch(e.currentTarget.value)}
            placeholder={t("auth_files.search_models_placeholder")}
            startAdornment={<Search size={15} className="text-ink-3" aria-hidden="true" />}
            data-dismiss-safe=""
          />

          {/* 一层无边淡底装下「全选」行和列表，不再描边、也不再用分隔线切出表头。 */}
          <div className="overflow-hidden rounded-2xl bg-subtle">
            <div className="flex items-center justify-between gap-3 px-3 pt-2.5 pb-1">
              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-ink-2">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={
                    !allVisibleSelected && visibleIds.some((id) => importSelected.has(id))
                  }
                  onCheckedChange={toggleAllVisible}
                  disabled={visibleIds.length === 0}
                />
                {t("auth_files.import_select_visible")}
              </label>
              {importSelected.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setImportSelected(new Set())}
                  className="rounded-full px-2 py-0.5 text-xs text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  {t("auth_files.import_clear_selection")}
                </button>
              ) : null}
            </div>
            {importFilteredModels.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-3">
                {t("auth_files.import_no_match", { query: importSearch.trim() })}
              </p>
            ) : (
              <div className="max-h-72 space-y-0.5 overflow-y-auto p-1.5">
                {importFilteredModels.map((model) => {
                  const checked = importSelected.has(model.id);
                  return (
                    <label
                      key={model.id}
                      className={[
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        checked ? "bg-selected text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
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
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
