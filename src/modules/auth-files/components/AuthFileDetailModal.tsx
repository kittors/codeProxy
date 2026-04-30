import type { Dispatch, SetStateAction } from "react";
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
  isOauthAuthFile,
  matchesModelPattern,
  normalizeProviderKey,
  readAuthFileChannelName,
  type AuthFileModelItem,
  type AuthFileModelOwnerGroup,
  type ChannelEditorState,
  type PrefixProxyEditorState,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

type DetailTab = "fields" | "models";

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
  savePrefixProxy: () => Promise<void>;
  proxyPoolEntries: ProxyPoolEntry[];
  channelEditor: ChannelEditorState;
  setChannelEditor: Dispatch<SetStateAction<ChannelEditorState>>;
  saveChannelEditor: () => Promise<boolean>;
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
  const providerKey = normalizeProviderKey(modelsFileType);
  const excludedModels = excluded[providerKey] ?? [];
  const isOauthDetailFile = detailFile ? isOauthAuthFile(detailFile) : false;
  const channelBaseline = detailFile ? readAuthFileChannelName(detailFile) : "";
  const channelEditorMatchesFile = Boolean(
    detailFile && channelEditor.fileName === detailFile.name,
  );
  const channelLabelValue =
    isOauthDetailFile && channelEditorMatchesFile ? channelEditor.label : channelBaseline;
  const channelDirty =
    isOauthDetailFile && channelEditorMatchesFile && channelEditor.label.trim() !== channelBaseline;
  const saveFieldsDisabled =
    prefixProxyEditor.loading ||
    prefixProxyEditor.saving ||
    channelEditor.saving ||
    !((prefixProxyDirty && prefixProxyEditor.json) || channelDirty);

  const closeModal = () => {
    setDetailOpen(false);
    setDetailTab("fields");
  };

  const saveFields = async () => {
    if (channelDirty) {
      const saved = await saveChannelEditor();
      if (!saved) return;
    }
    if (prefixProxyDirty) {
      await savePrefixProxy();
    }
  };

  return (
    <Modal
      open={open}
      title={
        detailFile
          ? t("auth_files.view_file_title", { name: detailFile.name })
          : t("auth_files.view_auth_file")
      }
      maxWidth="max-w-4xl"
      bodyHeightClassName="h-[70vh]"
      bodyClassName="flex flex-col !overflow-hidden"
      bodyTestId="auth-file-detail-body"
      onClose={closeModal}
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

          {detailFile ? (
            <Button
              variant="secondary"
              onClick={() => downloadTextAsFile(detailText, detailFile.name)}
              disabled={detailLoading}
            >
              <Download size={14} />
              {t("auth_files.download")}
            </Button>
          ) : null}

          {detailTab === "fields" ? (
            <Button
              variant="primary"
              onClick={() => void saveFields()}
              disabled={saveFieldsDisabled}
            >
              <ShieldCheck size={14} />
              {t("auth_files.save")}
            </Button>
          ) : null}

          <Button variant="secondary" onClick={closeModal}>
            {t("auth_files.close")}
          </Button>
        </div>
      }
    >
      {!detailFile ? (
        <EmptyState title={t("auth_files.view_auth_file")} description="--" />
      ) : (
        <Tabs value={detailTab} onValueChange={(next) => setDetailTab(next as DetailTab)} size="sm">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0">
              <TabsList>
                <TabsTrigger value="fields">{t("auth_files.detail_tab_fields")}</TabsTrigger>
                <TabsTrigger value="models">{t("auth_files.detail_tab_models")}</TabsTrigger>
              </TabsList>
            </div>

            <div
              className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
              data-testid="auth-file-detail-scroll"
            >
              <TabsContent value="fields" className="pb-1">
                {prefixProxyEditor.loading ? (
                  <div className="text-sm text-slate-600 dark:text-white/65">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : (
                  <div className="max-w-3xl space-y-5" data-testid="auth-file-fields-grid">
                    {isOauthDetailFile ? (
                      <div className="grid gap-2">
                        <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                          {t("auth_files.channel_name_label")}
                        </p>
                        <TextInput
                          value={channelLabelValue}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setChannelEditor((prev) => ({
                              ...prev,
                              fileName: detailFile.name,
                              label: value,
                              error: null,
                            }));
                          }}
                          placeholder={t("auth_files.channel_name_placeholder")}
                        />
                        {channelEditor.error ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {channelEditor.error}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-white/55">
                            {t("auth_files.channel_name_hint")}
                          </p>
                        )}
                      </div>
                    ) : null}

                    {prefixProxyEditor.json ? (
                      <>
                        <div className="grid gap-2">
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

                        <div className="grid gap-2">
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

                        <div className="grid gap-2">
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

                        <div className="grid gap-2">
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
                                previousMonth: t(
                                  "auth_files.subscription_date_picker_previous_month",
                                ),
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
                      </>
                    ) : (
                      <EmptyState
                        title={t("auth_files_page.cannot_edit")}
                        description={prefixProxyEditor.error || t("auth_files.unknown_error")}
                      />
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="models" className="space-y-3 pb-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                  <div className="rounded-lg bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-white/60">
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
                        className="grid gap-2 rounded-lg bg-slate-50/80 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:bg-white/[0.04]"
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
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
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
            </div>
          </div>
        </Tabs>
      )}
    </Modal>
  );
}
