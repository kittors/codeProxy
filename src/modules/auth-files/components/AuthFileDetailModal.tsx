import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import type { AuthFileItem, AuthFileSubscriptionPeriod } from "@/lib/http/types";
import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { Button } from "@/modules/ui/Button";
import { DateTimePicker } from "@/modules/ui/DateTimePicker";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
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
  type AuthFileModelOwnerGroup,
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
  loadModelOwnerGroups: () => Promise<void>;
  modelsLoading: boolean;
  modelsError: string | null;
  modelsList: AuthFileModelItem[];
  modelsFileType: string;
  modelOwnerGroupsLoading: boolean;
  mappedModelOwnerGroup: AuthFileModelOwnerGroup | null;
  mappedModelOwnerValue: string;
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

const formatDetailJson = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "--";

  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
  } catch {
    return text;
  }
};

export function AuthFileDetailModal({
  open,
  detailFile,
  detailLoading,
  detailText,
  detailTab,
  setDetailOpen,
  setDetailTab,
  loadModelsForDetail,
  loadModelOwnerGroups,
  modelsLoading,
  modelsError,
  modelsList,
  modelsFileType,
  modelOwnerGroupsLoading,
  mappedModelOwnerGroup,
  mappedModelOwnerValue,
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
  const { t, i18n } = useTranslation();
  const proxyCheckState = useProxyPoolChecks(proxyPoolEntries, open && detailTab === "fields");
  const usesMappedModelOwner = Boolean(mappedModelOwnerValue);
  const visibleModelsList = usesMappedModelOwner
    ? (mappedModelOwnerGroup?.models ?? [])
    : modelsList;
  const visibleModelsLoading = usesMappedModelOwner ? modelOwnerGroupsLoading : modelsLoading;
  const visibleModelsError = usesMappedModelOwner ? null : modelsError;
  const formattedDetailText = useMemo(() => formatDetailJson(detailText), [detailText]);
  const providerKey = normalizeProviderKey(modelsFileType);
  const excludedModels = excluded[providerKey] ?? [];

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
              onClick={() => {
                if (usesMappedModelOwner) {
                  void loadModelOwnerGroups();
                } else {
                  void loadModelsForDetail(detailFile, { force: true });
                }
              }}
              disabled={visibleModelsLoading}
            >
              <RefreshCw size={14} className={visibleModelsLoading ? "animate-spin" : ""} />
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
        <Tabs value={detailTab} onValueChange={(next) => setDetailTab(next as DetailTab)} size="sm">
          <div className="space-y-3">
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

            <TabsContent value="json" className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-neutral-800">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auth_files.detail_tab_json")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                    {t("auth_files.detail_tab_json_desc")}
                  </p>
                </div>
                {typeof detailFile.size === "number" ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                    {formatFileSize(detailFile.size)}
                  </span>
                ) : null}
              </div>

              {detailLoading ? (
                <div className="text-sm text-slate-600 dark:text-white/65">
                  {t("common.loading_ellipsis")}
                </div>
              ) : (
                <pre
                  data-testid="auth-file-json-reader"
                  className="max-h-[calc(70vh-9rem)] overflow-auto rounded-xl border border-slate-200 bg-white p-4 font-mono text-[12px] leading-5 whitespace-pre text-slate-900 shadow-inner shadow-slate-100/70 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:shadow-black/20"
                >
                  {formattedDetailText}
                </pre>
              )}
            </TabsContent>

            <TabsContent value="models" className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-neutral-800">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auth_files.detail_tab_models")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                    {t("auth_files.detail_tab_models_desc")}
                  </p>
                </div>
                {!visibleModelsLoading && visibleModelsError !== "unsupported" ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                    {t("auth_files.count_items", { count: visibleModelsList.length })}
                  </span>
                ) : null}
              </div>

              {usesMappedModelOwner ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-white/60">
                  {mappedModelOwnerGroup
                    ? t("auth_files.model_owner_group_source_desc", {
                        owner: mappedModelOwnerGroup.label,
                        count: mappedModelOwnerGroup.models.length,
                      })
                    : t("auth_files.model_owner_group_unavailable")}
                </div>
              ) : null}

              {visibleModelsLoading ? (
                <div className="text-sm text-slate-600 dark:text-white/65">
                  {t("common.loading_ellipsis")}
                </div>
              ) : visibleModelsError === "unsupported" ? (
                <EmptyState
                  title={t("auth_files.api_not_supported")}
                  description={t("auth_files.no_models_api")}
                />
              ) : visibleModelsList.length === 0 ? (
                <EmptyState
                  title={t("common.no_model_data")}
                  description={
                    usesMappedModelOwner
                      ? t("auth_files.no_owner_group_models")
                      : t("auth_files_page.models_hint")
                  }
                />
              ) : (
                <div className="grid gap-2" data-testid="auth-file-models-list">
                  {visibleModelsList.map((model) => (
                    <div
                      key={model.id}
                      className="grid gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-100/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                          {model.id}
                        </p>
                        {model.display_name ? (
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/55">
                            {model.display_name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        {model.owned_by ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                            {model.owned_by}
                          </span>
                        ) : null}
                        {excludedModels.some((pattern) =>
                          matchesModelPattern(model.id, pattern),
                        ) ? (
                          <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                            {t("auth_files.oauth_excluded")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="fields" className="space-y-3">
              <div className="border-b border-slate-200 pb-3 dark:border-neutral-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auth_files.detail_tab_fields")}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                  {t("auth_files.prefix_proxy_desc")}
                </p>
              </div>

              {prefixProxyEditor.loading ? (
                <div className="text-sm text-slate-600 dark:text-white/65">
                  {t("common.loading_ellipsis")}
                </div>
              ) : prefixProxyEditor.json ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
                  <div
                    className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-100/70 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/20"
                    data-testid="auth-file-fields-grid"
                  >
                    <div className="grid gap-2 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                        {t("auth_files.prefix_label")}
                      </p>
                      <TextInput
                        value={prefixProxyEditor.prefix}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setPrefixProxyEditor((prev) => ({ ...prev, prefix: value }));
                        }}
                        placeholder={t("auth_files.prefix_placeholder")}
                      />
                      <p className="text-xs text-slate-500 dark:text-white/55">
                        {t("auth_files.leave_empty_prefix")}
                      </p>
                    </div>

                    <div className="px-4 py-3">
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

                    <div className="grid gap-2 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                        {t("auth_files.proxy_url_label")}
                      </p>
                      <TextInput
                        value={prefixProxyEditor.proxyUrl}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl: value }));
                        }}
                        placeholder={t("auth_files.proxy_url_placeholder")}
                      />
                      <p className="text-xs text-slate-500 dark:text-white/55">
                        {t("auth_files.leave_empty_proxy")}
                      </p>
                    </div>

                    <div className="grid gap-2 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                        {t("auth_files.subscription_started_at_label")}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                        <DateTimePicker
                          value={prefixProxyEditor.subscriptionStartedAt}
                          onChange={(value) => {
                            setPrefixProxyEditor((prev) => ({
                              ...prev,
                              subscriptionStartedAt: value,
                            }));
                          }}
                          aria-label={t("auth_files.subscription_started_at_label")}
                          locale={i18n.language}
                          labels={{
                            picker: t("auth_files.subscription_date_picker"),
                            open: t("auth_files.subscription_date_picker_open"),
                            previousMonth: t("auth_files.subscription_date_picker_previous_month"),
                            nextMonth: t("auth_files.subscription_date_picker_next_month"),
                            today: t("auth_files.subscription_date_picker_today"),
                            clear: t("auth_files.subscription_date_picker_clear"),
                            hour: t("auth_files.subscription_date_picker_hour"),
                            minute: t("auth_files.subscription_date_picker_minute"),
                          }}
                        />
                        <Select
                          value={prefixProxyEditor.subscriptionPeriod}
                          onChange={(value) =>
                            setPrefixProxyEditor((prev) => ({
                              ...prev,
                              subscriptionPeriod: value as AuthFileSubscriptionPeriod,
                            }))
                          }
                          options={[
                            {
                              value: "monthly",
                              label: t("auth_files.subscription_period_monthly"),
                            },
                            {
                              value: "yearly",
                              label: t("auth_files.subscription_period_yearly"),
                            },
                          ]}
                          aria-label={t("auth_files.subscription_period_label")}
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-white/55">
                        {t("auth_files.subscription_started_at_hint")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("auth_files.preview_after_save")}
                      </p>
                      <span className="text-xs text-slate-500 dark:text-white/55">
                        {formatFileSize(MAX_AUTH_FILE_SIZE)}
                      </span>
                    </div>
                    <pre
                      data-testid="auth-file-fields-preview"
                      className="mt-3 max-h-[24rem] overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[12px] leading-5 whitespace-pre text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100"
                    >
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

            <TabsContent value="channel" className="space-y-3">
              <div className="border-b border-slate-200 pb-3 dark:border-neutral-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auth_files.detail_tab_channel")}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                  {t("auth_files.edit_channel_name_desc")}
                </p>
              </div>

              <div className="max-w-2xl space-y-3">
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
