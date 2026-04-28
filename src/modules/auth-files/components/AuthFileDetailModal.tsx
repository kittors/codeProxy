import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import type { AuthFileItem } from "@/lib/http/types";
import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ProxyPoolSelect } from "@/modules/proxies/ProxyPoolSelect";
import { useProxyPoolChecks } from "@/modules/proxies/useProxyPoolChecks";
import {
  downloadTextAsFile,
  formatFileSize,
  MAX_AUTH_FILE_SIZE,
  matchesModelPattern,
  normalizeProviderKey,
  type AuthFileModelItem,
  type ChannelEditorState,
  type PrefixProxyEditorState,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

type DetailTab = "json" | "models" | "fields" | "channel";

interface AuthFileDetailModalProps {
  open: boolean;
  detailFile: AuthFileItem | null;
  detailLoading: boolean;
  detailText: string;
  detailTab: DetailTab;
  setDetailOpen: Dispatch<SetStateAction<boolean>>;
  setDetailTab: Dispatch<SetStateAction<DetailTab>>;
  loadModelsForDetail: (file: AuthFileItem, options?: { force?: boolean }) => Promise<void>;
  modelsLoading: boolean;
  modelsError: string | null;
  modelsList: AuthFileModelItem[];
  modelsFileType: string;
  excluded: Record<string, string[]>;
  prefixProxyEditor: PrefixProxyEditorState;
  setPrefixProxyEditor: Dispatch<SetStateAction<PrefixProxyEditorState>>;
  prefixProxyDirty: boolean;
  prefixProxyUpdatedText: string;
  savePrefixProxy: () => Promise<void>;
  proxyPoolEntries: ProxyPoolEntry[];
  channelEditor: ChannelEditorState;
  setChannelEditor: Dispatch<SetStateAction<ChannelEditorState>>;
  saveChannelEditor: () => Promise<void>;
}

export function AuthFileDetailModal({
  open,
  detailFile,
  detailLoading,
  detailText,
  detailTab,
  setDetailOpen,
  setDetailTab,
  loadModelsForDetail,
  modelsLoading,
  modelsError,
  modelsList,
  modelsFileType,
  excluded,
  prefixProxyEditor,
  setPrefixProxyEditor,
  prefixProxyDirty,
  prefixProxyUpdatedText,
  savePrefixProxy,
  proxyPoolEntries,
  channelEditor,
  setChannelEditor,
  saveChannelEditor,
}: AuthFileDetailModalProps) {
  const { t } = useTranslation();
  const proxyCheckState = useProxyPoolChecks(proxyPoolEntries, open && detailTab === "fields");

  return (
    <Modal
      open={open}
      title={
        detailFile
          ? t("auth_files.view_file_title", { name: detailFile.name })
          : t("auth_files.view_auth_file")
      }
      maxWidth="max-w-5xl"
      bodyHeightClassName="h-[70vh]"
      onClose={() => {
        setDetailOpen(false);
        setDetailTab("json");
      }}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {detailTab === "models" && detailFile ? (
            <Button
              variant="secondary"
              onClick={() => void loadModelsForDetail(detailFile, { force: true })}
              disabled={modelsLoading}
            >
              <RefreshCw size={14} className={modelsLoading ? "animate-spin" : ""} />
              {t("auth_files.detail_models_refresh")}
            </Button>
          ) : null}

          {detailTab === "json" ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (detailFile) {
                  downloadTextAsFile(detailText, detailFile.name);
                }
              }}
              disabled={!detailFile || detailLoading}
            >
              <Download size={14} />
              {t("auth_files.download")}
            </Button>
          ) : null}

          {detailTab === "fields" ? (
            <Button
              variant="primary"
              onClick={() => void savePrefixProxy()}
              disabled={
                prefixProxyEditor.loading ||
                prefixProxyEditor.saving ||
                !prefixProxyEditor.json ||
                !prefixProxyDirty
              }
            >
              <ShieldCheck size={14} />
              {t("auth_files.save")}
            </Button>
          ) : null}

          {detailTab === "channel" ? (
            <Button
              variant="primary"
              onClick={() => void saveChannelEditor()}
              disabled={channelEditor.saving}
            >
              <ShieldCheck size={14} />
              {t("auth_files.save")}
            </Button>
          ) : null}

          <Button
            variant="secondary"
            onClick={() => {
              setDetailOpen(false);
              setDetailTab("json");
            }}
          >
            {t("auth_files.close")}
          </Button>
        </div>
      }
    >
      {!detailFile ? (
        <EmptyState title={t("auth_files.view_auth_file")} description="--" />
      ) : (
        <Tabs value={detailTab} onValueChange={(next) => setDetailTab(next as DetailTab)}>
          <div className="space-y-4">
            <TabsList>
              <TabsTrigger value="json">{t("auth_files.detail_tab_json")}</TabsTrigger>
              <TabsTrigger value="models">{t("auth_files.detail_tab_models")}</TabsTrigger>
              <TabsTrigger value="fields">{t("auth_files.detail_tab_fields")}</TabsTrigger>
              {String(detailFile.account_type || "")
                .trim()
                .toLowerCase() === "oauth" ? (
                <TabsTrigger value="channel">{t("auth_files.detail_tab_channel")}</TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="json" className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auth_files.detail_tab_json")}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                  {t("auth_files.detail_tab_json_desc")}
                </p>
              </div>

              {detailLoading ? (
                <div className="text-sm text-slate-600 dark:text-white/65">
                  {t("common.loading_ellipsis")}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                  {detailText || "--"}
                </pre>
              )}
            </TabsContent>

            <TabsContent value="models" className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auth_files.detail_tab_models")}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                  {t("auth_files.detail_tab_models_desc")}
                </p>
              </div>

              {modelsLoading ? (
                <div className="text-sm text-slate-600 dark:text-white/65">
                  {t("common.loading_ellipsis")}
                </div>
              ) : modelsError === "unsupported" ? (
                <EmptyState
                  title={t("auth_files.api_not_supported")}
                  description={t("auth_files.no_models_api")}
                />
              ) : modelsList.length === 0 ? (
                <EmptyState
                  title={t("common.no_model_data")}
                  description={t("auth_files_page.models_hint")}
                />
              ) : (
                <div className="space-y-2">
                  {modelsList.map((model) => (
                    <div
                      key={model.id}
                      className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs text-slate-900 dark:text-white">
                          {model.id}
                        </p>
                        {(() => {
                          const providerKey = normalizeProviderKey(modelsFileType);
                          const excludedModels = excluded[providerKey] ?? [];
                          const hit = excludedModels.some((pattern) =>
                            matchesModelPattern(model.id, pattern),
                          );
                          if (!hit) return null;
                          return (
                            <span className="inline-flex rounded-lg bg-rose-600/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                              {t("auth_files.oauth_excluded")}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                        {model.display_name ? `display_name: ${model.display_name}` : ""}
                        {model.owned_by ? ` · owned_by: ${model.owned_by}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="fields" className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auth_files.detail_tab_fields")}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                  {t("auth_files.prefix_proxy_desc")}
                </p>
              </div>

              {prefixProxyEditor.loading ? (
                <div className="text-sm text-slate-600 dark:text-white/65">
                  {t("common.loading_ellipsis")}
                </div>
              ) : prefixProxyEditor.json ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("auth_files.prefix_label")}
                    </p>
                    <div className="mt-2">
                      <TextInput
                        value={prefixProxyEditor.prefix}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setPrefixProxyEditor((prev) => ({ ...prev, prefix: value }));
                        }}
                        placeholder={t("auth_files.prefix_placeholder")}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                      {t("auth_files.leave_empty_prefix")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <ProxyPoolSelect
                      value={prefixProxyEditor.proxyId}
                      entries={proxyPoolEntries}
                      onChange={(value) =>
                        setPrefixProxyEditor((prev) => ({ ...prev, proxyId: value }))
                      }
                      label={t("auth_files.proxy_id_label")}
                      hint={t("auth_files.leave_empty_proxy_id")}
                      ariaLabel={t("auth_files.proxy_id_label")}
                      checkState={proxyCheckState}
                      showDetails
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("auth_files.proxy_url_label")}
                    </p>
                    <div className="mt-2">
                      <TextInput
                        value={prefixProxyEditor.proxyUrl}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl: value }));
                        }}
                        placeholder={t("auth_files.proxy_url_placeholder")}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                      {t("auth_files.leave_empty_proxy")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("auth_files.subscription_expires_at_label")}
                    </p>
                    <div className="mt-2">
                      <TextInput
                        type="datetime-local"
                        value={prefixProxyEditor.subscriptionExpiresAt}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setPrefixProxyEditor((prev) => ({
                            ...prev,
                            subscriptionExpiresAt: value,
                          }));
                        }}
                        aria-label={t("auth_files.subscription_expires_at_label")}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                      {t("auth_files.subscription_expires_at_hint")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("auth_files.preview_after_save")}
                    </p>
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                      {prefixProxyUpdatedText}
                    </pre>
                    <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                      {t("auth_files.save_note", { size: formatFileSize(MAX_AUTH_FILE_SIZE) })}
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title={t("auth_files_page.cannot_edit")}
                  description={prefixProxyEditor.error || t("auth_files.unknown_error")}
                />
              )}
            </TabsContent>

            <TabsContent value="channel" className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auth_files.detail_tab_channel")}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                  {t("auth_files.edit_channel_name_desc")}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    {t("auth_files.channel_name_label")}
                  </label>
                  <TextInput
                    value={channelEditor.label}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setChannelEditor((prev) => ({ ...prev, label: value, error: null }));
                    }}
                    placeholder={t("auth_files.channel_name_placeholder")}
                  />
                </div>
                {channelEditor.error ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">{channelEditor.error}</p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-white/55">
                    {t("auth_files.channel_name_hint")}
                  </p>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      )}
    </Modal>
  );
}
