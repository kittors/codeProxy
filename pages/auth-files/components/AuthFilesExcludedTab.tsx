import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { FileJson, Plus, RefreshCw } from "lucide-react";
import { Button, ProviderTag, surface, iconHueClass } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";

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
  deleteExcludedProvider: (provider: string) => void;
  showHeading?: boolean;
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
  deleteExcludedProvider,
  showHeading = true,
}: AuthFilesExcludedTabProps) {
  const { t } = useTranslation();

  return (
    <div className={showHeading ? "mt-4 space-y-4" : "space-y-4"}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {showHeading ? (
          <div>
            <h2 className="text-lg font-bold text-ink">
              {t("auth_files_page.excluded_title")}
            </h2>
            <p className="mt-1 text-sm text-ink-3">
              {t("auth_files_page.excluded_desc")}
            </p>
          </div>
        ) : (
          <div />
        )}
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
        <div className="flex h-32 items-center justify-center text-sm text-ink-3">
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
              endAdornment={<FileJson size={16} className={`text-ink-3 ${iconHueClass(FileJson)}`} />}
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
                      className={`p-4 transition-colors duration-200 ease-out ${surface({ radius: "2xl" })}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          {/* 供应商名用品牌色标签，和账号卡片上的供应商标签同色。 */}
                          <ProviderTag vendor={provider} withLogo>
                            {provider}
                          </ProviderTag>
                          <p className="mt-1 text-xs text-ink-3">
                            {t("auth_files.count_items", { count })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary-danger"
                            size="sm"
                            onClick={() => deleteExcludedProvider(provider)}
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
                        className="mt-3 min-h-[120px] w-full resize-y rounded-inner bg-field px-3 py-2 font-mono text-xs text-ink shadow-control outline-none transition-[box-shadow] duration-200 ease-out placeholder:text-ink-3 hover:shadow-control-hover focus-visible:shadow-control-focus"
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
