import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button, Checkbox, EmptyState, ProviderTag, TextInput, surface } from "@code-proxy/ui";
import type { AliasRow } from "@code-proxy/domain";

interface AuthFilesAliasTabProps {
  aliasLoading: boolean;
  isPending: boolean;
  refreshAlias: () => Promise<void>;
  aliasUnsupported: boolean;
  aliasNewChannel: string;
  setAliasNewChannel: Dispatch<SetStateAction<string>>;
  addAliasChannel: () => void;
  aliasEditing: Record<string, AliasRow[]>;
  setAliasEditing: Dispatch<SetStateAction<Record<string, AliasRow[]>>>;
  openImport: (channel: string) => Promise<void>;
  deleteAliasChannel: (channel: string) => void;
  showHeading?: boolean;
}

export function AuthFilesAliasTab({
  aliasLoading,
  isPending,
  refreshAlias,
  aliasUnsupported,
  aliasNewChannel,
  setAliasNewChannel,
  addAliasChannel,
  aliasEditing,
  setAliasEditing,
  openImport,
  deleteAliasChannel,
  showHeading = true,
}: AuthFilesAliasTabProps) {
  const { t } = useTranslation();

  return (
    <div className={showHeading ? "mt-4 space-y-4" : "space-y-4"}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {showHeading ? (
          <div>
            <h2 className="text-lg font-bold text-ink">
              {t("auth_files_page.alias_title")}
            </h2>
            <p className="mt-1 text-sm text-ink-3">
              {t("auth_files.model_alias_desc")}
            </p>
          </div>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshAlias()}
            disabled={aliasLoading || isPending}
          >
            <RefreshCw size={14} className={aliasLoading ? "animate-spin" : ""} />
            {t("auth_files.refresh")}
          </Button>
        </div>
      </div>

      {aliasLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-ink-3">
          {t("common.loading_ellipsis")}
        </div>
      ) : (
        <div className="space-y-4">
          {aliasUnsupported ? (
            <div className="mb-4">
              <EmptyState
                title={t("auth_files.api_not_supported")}
                description={t("auth_files.no_alias_api")}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              value={aliasNewChannel}
              onChange={(e) => setAliasNewChannel(e.currentTarget.value)}
              placeholder={t("auth_files.add_channel_placeholder")}
              disabled={aliasUnsupported}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={addAliasChannel}
              disabled={isPending || aliasUnsupported}
            >
              <Plus size={14} />
              {t("auth_files.add")}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {Object.keys(aliasEditing).length === 0 ? (
              <EmptyState
                title={t("auth_files.no_config")}
                description={t("auth_files_page.alias_no_config")}
              />
            ) : (
              Object.keys(aliasEditing)
                .sort((a, b) => a.localeCompare(b))
                .map((channel) => {
                  const rows = aliasEditing[channel] ?? [];
                  const mappingCount = rows.filter((r) => r.name.trim() && r.alias.trim()).length;

                  return (
                    <div
                      key={channel}
                      className={`p-4 transition-colors duration-200 ease-out ${surface({ radius: "2xl" })}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          {/* 渠道即供应商类型，用品牌色标签，和账号卡片上的供应商标签同色。 */}
                          <ProviderTag vendor={channel} withLogo>
                            {channel}
                          </ProviderTag>
                          <p className="mt-1 text-xs text-ink-3">
                            {t("auth_files.valid_mappings", { count: mappingCount })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void openImport(channel)}
                            disabled={aliasUnsupported}
                          >
                            <ShieldCheck size={14} />
                            {t("auth_files.import_models")}
                          </Button>
                          <Button
                            variant="secondary-danger"
                            size="sm"
                            onClick={() => deleteAliasChannel(channel)}
                            disabled={isPending || aliasUnsupported}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {rows.map((row, idx) => (
                          <div
                            key={row.id}
                            className="flex flex-col gap-2 sm:flex-row sm:items-center"
                          >
                            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                              <TextInput
                                value={row.name}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  setAliasEditing((prev) => ({
                                    ...prev,
                                    [channel]: (prev[channel] ?? []).map((it, i) =>
                                      i === idx ? { ...it, name: value } : it,
                                    ),
                                  }));
                                }}
                                placeholder={t("auth_files.name_placeholder", "name")}
                                aria-label={t("auth_files.name_placeholder", "name")}
                              />
                              <TextInput
                                value={row.alias}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  setAliasEditing((prev) => ({
                                    ...prev,
                                    [channel]: (prev[channel] ?? []).map((it, i) =>
                                      i === idx ? { ...it, alias: value } : it,
                                    ),
                                  }));
                                }}
                                placeholder={t("auth_files.alias_placeholder", "alias")}
                                aria-label={t("auth_files.alias_placeholder", "alias")}
                              />
                            </div>
                            <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                              <label
                                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl px-1 text-sm text-ink-2 transition-colors hover:text-slate-900 dark:hover:text-white"
                                title={t("auth_files.fork_hint")}
                              >
                                <Checkbox
                                  checked={Boolean(row.fork)}
                                  onCheckedChange={(checked) => {
                                    setAliasEditing((prev) => ({
                                      ...prev,
                                      [channel]: (prev[channel] ?? []).map((it, i) =>
                                        i === idx ? { ...it, fork: checked } : it,
                                      ),
                                    }));
                                  }}
                                  aria-label={t("auth_files.fork_label")}
                                />
                                <span className="whitespace-nowrap select-none">
                                  {t("auth_files.fork_label")}
                                </span>
                              </label>
                              <Button
                                variant="ghost-danger"
                                size="sm"
                                onClick={() => {
                                  setAliasEditing((prev) => ({
                                    ...prev,
                                    [channel]: (prev[channel] ?? []).filter((_, i) => i !== idx),
                                  }));
                                }}
                                aria-label={t("common.delete_row", "Delete Row")}
                                title={t("common.delete")}
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setAliasEditing((prev) => ({
                                ...prev,
                                [channel]: [
                                  ...(prev[channel] ?? []),
                                  { id: `row-${Date.now()}`, name: "", alias: "" },
                                ],
                              }));
                            }}
                          >
                            <Plus size={14} />
                            {t("auth_files.add_row")}
                          </Button>
                        </div>
                      </div>
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
