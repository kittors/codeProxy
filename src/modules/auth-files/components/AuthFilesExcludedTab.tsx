import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { FileJson, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";

interface AuthFilesExcludedTabProps {
  excludedLoading: boolean;
  isPending: boolean;
  refreshExcluded: () => Promise<void>;
  excludedUnsupported: boolean;
  excludedNewProvider: string;
  setExcludedNewProvider: Dispatch<SetStateAction<string>>;
  addExcludedProvider: () => void;
  excluded: Record<string, string[]>;
  excludedDraft: Record<string, string>;
  setExcludedDraft: Dispatch<SetStateAction<Record<string, string>>>;
  saveExcludedProvider: (provider: string, text: string) => Promise<void>;
  deleteExcludedProvider: (provider: string) => Promise<void>;
}

export function AuthFilesExcludedTab({
  excludedLoading,
  isPending,
  refreshExcluded,
  excludedUnsupported,
  excludedNewProvider,
  setExcludedNewProvider,
  addExcludedProvider,
  excluded,
  excludedDraft,
  setExcludedDraft,
  saveExcludedProvider,
  deleteExcludedProvider,
}: AuthFilesExcludedTabProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("auth_files_page.excluded_title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
            {t("auth_files_page.excluded_desc")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshExcluded()}
            disabled={excludedLoading || isPending}
          >
            <RefreshCw size={14} className={excludedLoading ? "animate-spin" : ""} />
            {t("auth_files.refresh")}
          </Button>
        </div>
      </div>

      {excludedLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-500">
          {t("common.loading_ellipsis")}
        </div>
      ) : (
        <div className="space-y-4">
          {excludedUnsupported ? (
            <div className="mb-4">
              <EmptyState
                title={t("auth_files_page.api_not_supported")}
                description={t("auth_files.no_excluded_api")}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              value={excludedNewProvider}
              onChange={(e) => setExcludedNewProvider(e.currentTarget.value)}
              placeholder={t("auth_files.add_provider_placeholder")}
              endAdornment={<FileJson size={16} className="text-slate-400" />}
              disabled={excludedUnsupported}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={addExcludedProvider}
              disabled={isPending || excludedUnsupported}
            >
              <Plus size={14} />
              {t("auth_files.add")}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {Object.keys(excluded).length === 0 ? (
              <EmptyState
                title={t("auth_files_page.no_config")}
                description={t("auth_files_page.no_excluded_desc")}
              />
            ) : (
              Object.entries(excluded)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([provider, models]) => {
                  const text =
                    excludedDraft[provider] ?? (Array.isArray(models) ? models.join("\n") : "");
                  const count = (excludedDraft[provider] ?? text)
                    .split(/[\n,]+/)
                    .map((s) => s.trim())
                    .filter(Boolean).length;

                  return (
                    <div
                      key={provider}
                      className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] transition-colors duration-200 ease-out dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-slate-900 dark:text-white">
                            {provider}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                            {t("auth_files.count_items", { count })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void saveExcludedProvider(provider, excludedDraft[provider] ?? text)
                            }
                            disabled={isPending || excludedUnsupported}
                          >
                            {t("auth_files.save")}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void deleteExcludedProvider(provider)}
                            disabled={isPending || excludedUnsupported}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      </div>
                      <textarea
                        value={excludedDraft[provider] ?? text}
                        onChange={(e) => {
                          const nextText = e.currentTarget.value;
                          setExcludedDraft((prev) => ({ ...prev, [provider]: nextText }));
                        }}
                        placeholder={t("auth_files.one_model_per_line")}
                        aria-label={`${provider} ${t("auth_files_page.excluded_tab")}`}
                        disabled={excludedUnsupported}
                        className="mt-3 min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition-colors duration-200 ease-out placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
                      />
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
