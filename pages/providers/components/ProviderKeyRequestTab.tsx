import { type Dispatch, type SetStateAction, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TextInput } from "@code-proxy/ui";
import { SearchableSelect } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { ProxyPoolSelect } from "@features/proxy-pool";
import { ModerationProfileSelect } from "@pages/content-moderation/components/ModerationProfileSelect";
import { KeyValueInputList } from "../KeyValueInputList";
import type { ProviderKeyDraft } from "../providers-helpers";

const SectionCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={[
      "rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";
const OPENCODE_GO_CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const OPENCODE_GO_MESSAGES_URL = "https://opencode.ai/zen/go/v1/messages";
const CLINE_BASE_URL = "https://api.cline.bot/api/v1";
const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
interface ProviderKeyRequestTabProps {
  keyDraft: ProviderKeyDraft;
  setKeyDraft: Dispatch<SetStateAction<ProviderKeyDraft>>;
  editKeyType: string;
  proxyPoolEntries: ProxyPoolEntry[];
  isOpenCodeGo: boolean;
  isCline: boolean;
  isOllamaCloud: boolean;
  openCodeVisionFallbackOptions: { value: string; label: string }[];
  openCodeModelsLoading: boolean;
}

export function ProviderKeyRequestTab({
  keyDraft,
  setKeyDraft,
  editKeyType,
  proxyPoolEntries,
  isOpenCodeGo,
  isCline,
  isOllamaCloud,
  openCodeVisionFallbackOptions,
  openCodeModelsLoading,
}: ProviderKeyRequestTabProps) {
  const { t } = useTranslation();
  const isBedrock = editKeyType === "bedrock";
  const clineChatUrl = useMemo(() => {
    const baseUrl = keyDraft.baseUrl.trim().replace(/\/+$/g, "") || CLINE_BASE_URL;
    return `${baseUrl}/chat/completions`;
  }, [keyDraft.baseUrl]);
  const ollamaCloudChatUrl = useMemo(() => {
    const baseUrl = keyDraft.baseUrl.trim().replace(/\/+$/g, "") || OLLAMA_CLOUD_BASE_URL;
    return `${baseUrl}/api/chat`;
  }, [keyDraft.baseUrl]);
  const hasDashboardUsage = isOpenCodeGo || isCline || isOllamaCloud;
  const dashboardUsageTitle = isOpenCodeGo
    ? t("providers.opencode_go_usage_title")
    : isCline
      ? t("providers.cline_usage_title")
      : t("providers.ollama_cloud_usage_title");
  const dashboardUsageHint = isOpenCodeGo
    ? t("providers.opencode_go_usage_config_hint")
    : t("providers.dashboard_usage_config_hint");

  return (
    <div className="space-y-4">
      <SectionCard>
        <ModerationProfileSelect
          channelType="provider_key"
          channelId={keyDraft.id}
          label={t("content_moderation.provider_key_profile_label")}
          hint={t("content_moderation.provider_key_profile_hint")}
          unpersistedHint={t("content_moderation.provider_key_profile_save_first")}
        />
      </SectionCard>

      {isOpenCodeGo ? (
        <SectionCard className="bg-slate-50/80 dark:bg-neutral-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.opencode_go_fixed_endpoint_title")}
          </p>
          <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-white/65">
            <p className="break-all font-mono">{OPENCODE_GO_CHAT_URL}</p>
            <p className="break-all font-mono">{OPENCODE_GO_MESSAGES_URL}</p>
            <p className="break-all font-mono">{OPENCODE_GO_MODELS_URL}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.opencode_go_fixed_endpoint_hint")}
          </p>
        </SectionCard>
      ) : null}

      {isCline ? (
        <SectionCard className="bg-slate-50/80 dark:bg-neutral-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.cline_endpoint_title")}
          </p>
          <p className="mt-3 break-all font-mono text-xs text-slate-600 dark:text-white/65">
            {clineChatUrl}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.cline_endpoint_hint")}
          </p>
        </SectionCard>
      ) : null}

      {isOllamaCloud ? (
        <SectionCard className="bg-slate-50/80 dark:bg-neutral-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.ollama_cloud_endpoint_title")}
          </p>
          <p className="mt-3 break-all font-mono text-xs text-slate-600 dark:text-white/65">
            {ollamaCloudChatUrl}
          </p>
        </SectionCard>
      ) : null}

      {hasDashboardUsage ? (
        <SectionCard>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {dashboardUsageTitle}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
            {dashboardUsageHint}
          </p>

          <div
            className={[
              "mt-3 grid gap-3",
              isOpenCodeGo ? "md:grid-cols-2" : "md:grid-cols-1",
            ].join(" ")}
          >
            {isOpenCodeGo ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                  {t("providers.opencode_go_workspace_id")}
                </p>
                <TextInput
                  value={keyDraft.workspaceId}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setKeyDraft((prev) => ({ ...prev, workspaceId: val }));
                  }}
                  placeholder={t("providers.opencode_go_workspace_id_placeholder")}
                />
                <p className="text-xs text-slate-500 dark:text-white/55">
                  {t("providers.opencode_go_workspace_id_hint")}
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                {t("providers.opencode_go_auth_cookie")}
              </p>
              <TextInput
                type="password"
                value={keyDraft.authCookie}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, authCookie: val }));
                }}
                placeholder={
                  isOpenCodeGo
                    ? t("providers.opencode_go_auth_cookie_placeholder")
                    : t("providers.dashboard_auth_cookie_placeholder")
                }
              />
            </div>
          </div>
        </SectionCard>
      ) : null}

      {isOpenCodeGo || isCline || editKeyType === "ollama-cloud" ? (
        <SectionCard>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.opencode_go_vision_fallback_title")}
          </p>
          <div className="mt-3">
            <SearchableSelect
              value={keyDraft.visionFallbackModel}
              onChange={(value) => setKeyDraft((prev) => ({ ...prev, visionFallbackModel: value }))}
              options={openCodeVisionFallbackOptions}
              placeholder={t("providers.opencode_go_vision_fallback_none")}
              searchPlaceholder={t("providers.models_search_placeholder")}
              aria-label={t("providers.opencode_go_vision_fallback_title")}
              disabled={openCodeModelsLoading || openCodeVisionFallbackOptions.length <= 1}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.opencode_go_vision_fallback_hint")}
          </p>
        </SectionCard>
      ) : null}

      {isBedrock ? (
        <SectionCard>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.bedrock_region")}
          </p>
          <div className="mt-2">
            <TextInput
              value={keyDraft.region}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, region: val }));
              }}
              placeholder="us-east-1"
            />
          </div>
          <div className="mt-3">
            <ToggleSwitch
              label={t("providers.bedrock_force_global")}
              description={t("providers.bedrock_force_global_hint")}
              checked={keyDraft.forceGlobal}
              onCheckedChange={(checked: boolean) =>
                setKeyDraft((prev) => ({ ...prev, forceGlobal: checked }))
              }
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.bedrock_region_hint")}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {t("providers.connection_proxy_label")}
        </p>
        <div className="mt-3 grid gap-3">
          {isOpenCodeGo ? null : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                {t("providers.base_url")}
              </p>
              <TextInput
                value={keyDraft.baseUrl}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, baseUrl: val }));
                }}
                placeholder={
                  isOllamaCloud
                    ? OLLAMA_CLOUD_BASE_URL
                    : isCline
                      ? CLINE_BASE_URL
                      : editKeyType === "claude"
                        ? t("providers.claude_base_url_placeholder")
                        : t("providers.base_url_placeholder")
                }
              />
            </div>
          )}
          <div className="space-y-2">
            <ProxyPoolSelect
              value={keyDraft.proxyId}
              entries={proxyPoolEntries}
              onChange={(value) => setKeyDraft((prev) => ({ ...prev, proxyId: value }))}
              label={t("providers.proxy_pool_label")}
              hint={t("providers.proxy_pool_hint")}
              ariaLabel={t("providers.proxy_pool_label")}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
              {t("providers.proxy_url")}
            </p>
            <TextInput
              value={keyDraft.proxyUrl}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, proxyUrl: val }));
              }}
              placeholder={t("providers.proxy_url_placeholder")}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
          {isOpenCodeGo
            ? t("providers.opencode_go_connection_hint")
            : isCline
              ? t("providers.cline_connection_hint")
              : t("providers.connection_proxy_hint")}
        </p>
      </SectionCard>

      <SectionCard>
        <KeyValueInputList
          title={t("providers.headers_optional")}
          entries={keyDraft.headersEntries}
          onChange={(next) => setKeyDraft((prev) => ({ ...prev, headersEntries: next }))}
          keyPlaceholder={t("providers.header_name_placeholder")}
          valuePlaceholder={t("providers.header_value_placeholder")}
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
          {t("providers.headers_common_hint")}
        </p>
      </SectionCard>

      {editKeyType === "claude" ? (
        <SectionCard>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("providers.anthropic_processing_label")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                {t("providers.anthropic_processing_hint")}
              </p>
            </div>
            <ToggleSwitch
              checked={!keyDraft.skipAnthropicProcessing}
              onCheckedChange={(checked: boolean) =>
                setKeyDraft((prev) => ({
                  ...prev,
                  skipAnthropicProcessing: !checked,
                }))
              }
            />
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
