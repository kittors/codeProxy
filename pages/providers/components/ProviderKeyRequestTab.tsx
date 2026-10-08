import { type Dispatch, type SetStateAction, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TextInput } from "@code-proxy/ui";
import { SearchableSelect } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { ProxyPoolSelect, ProxyUrlInput } from "@features/proxy-pool";
import { ModerationProfileSelect } from "@features/content-moderation";
import { useModerationPermissions } from "@app/providers/useModerationPermissions";
import { KeyValueInputList } from "../KeyValueInputList";
import type { ProviderKeyDraft } from "../providers-helpers";

/**
 * 一组字段。弹窗本身就是一层，组与组之间靠留白分开，不再各自套一张描边卡片——以前一个页签里
 * 叠着五六张描边小卡，读起来像一摞框。只读的说明（固定端点、调用地址）传 `well`，用无边淡底和可编辑的字段区分开。
 */
const FieldGroup = ({ children, well = false }: { children: React.ReactNode; well?: boolean }) => (
  <div className={well ? "rounded-xl bg-subtle px-4 py-3" : undefined}>{children}</div>
);

const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";
const OPENCODE_GO_CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const OPENCODE_GO_MESSAGES_URL = "https://opencode.ai/zen/go/v1/messages";
const CLINE_BASE_URL = "https://api.cline.bot/api/v1";
const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
const COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider/v1";
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
  const moderationPerms = useModerationPermissions();
  const isBedrock = editKeyType === "bedrock";
  const clineChatUrl = useMemo(() => {
    const baseUrl = keyDraft.baseUrl.trim().replace(/\/+$/g, "") || CLINE_BASE_URL;
    return `${baseUrl}/chat/completions`;
  }, [keyDraft.baseUrl]);
  const ollamaCloudChatUrl = useMemo(() => {
    const baseUrl = keyDraft.baseUrl.trim().replace(/\/+$/g, "") || OLLAMA_CLOUD_BASE_URL;
    return `${baseUrl}/api/chat`;
  }, [keyDraft.baseUrl]);
  const isCommandCode = editKeyType === "commandcode";
  const commandCodeChatUrl = useMemo(() => {
    const baseUrl =
      keyDraft.baseUrl.trim().replace(/\/+$/g, "") || COMMANDCODE_BASE_URL;
    return `${baseUrl}/chat/completions`;
  }, [keyDraft.baseUrl]);
  // OpenCode Go and Command Code report usage from the API key itself, so they
  // are usage-capable without belonging to the cookie-backed channels.
  const hasDashboardUsage = isCline || isOllamaCloud;
  const dashboardUsageTitle = isCline
    ? t("providers.cline_usage_title")
    : t("providers.ollama_cloud_usage_title");
  const dashboardUsageHint = t("providers.dashboard_usage_config_hint");

  return (
    <div className="space-y-6">
      <FieldGroup>
        <ModerationProfileSelect
        canRead={moderationPerms.canRead}
        canWrite={moderationPerms.canWrite}
          channelType="provider_key"
          channelId={keyDraft.id}
          label={t("content_moderation.provider_key_profile_label")}
          hint={t("content_moderation.provider_key_profile_hint")}
          unpersistedHint={t("content_moderation.provider_key_profile_save_first")}
        />
      </FieldGroup>

      {isOpenCodeGo ? (
        <>
          <FieldGroup well>
            <p className="text-sm font-semibold text-ink">
              {t("providers.opencode_go_fixed_endpoint_title")}
            </p>
            <div className="mt-3 grid gap-2 text-xs text-ink-2">
              <p className="break-all font-mono">{OPENCODE_GO_CHAT_URL}</p>
              <p className="break-all font-mono">{OPENCODE_GO_MESSAGES_URL}</p>
              <p className="break-all font-mono">{OPENCODE_GO_MODELS_URL}</p>
            </div>
            <p className="mt-2 text-xs text-ink-3">
              {t("providers.opencode_go_fixed_endpoint_hint")}
            </p>
          </FieldGroup>
          <FieldGroup>
            <p className="text-sm font-semibold text-ink">
              {t("providers.opencode_go_usage_title")}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {t("providers.opencode_go_usage_hint")}
            </p>
          </FieldGroup>
        </>
      ) : null}

      {isCline ? (
        <FieldGroup well>
          <p className="text-sm font-semibold text-ink">
            {t("providers.cline_endpoint_title")}
          </p>
          <p className="mt-3 break-all font-mono text-xs text-ink-2">
            {clineChatUrl}
          </p>
          <p className="mt-2 text-xs text-ink-3">
            {t("providers.cline_endpoint_hint")}
          </p>
        </FieldGroup>
      ) : null}

      {isOllamaCloud ? (
        <FieldGroup well>
          <p className="text-sm font-semibold text-ink">
            {t("providers.ollama_cloud_endpoint_title")}
          </p>
          <p className="mt-3 break-all font-mono text-xs text-ink-2">
            {ollamaCloudChatUrl}
          </p>
        </FieldGroup>
      ) : null}

      {isCommandCode ? (
        <>
          <FieldGroup well>
            <p className="text-sm font-semibold text-ink">
              {t("providers.commandcode_endpoint_title")}
            </p>
            <p className="mt-3 break-all font-mono text-xs text-ink-2">
              {commandCodeChatUrl}
            </p>
            <p className="mt-2 text-xs text-ink-3">
              {t("providers.commandcode_endpoint_hint")}
            </p>
          </FieldGroup>
          <FieldGroup>
            <p className="text-sm font-semibold text-ink">
              {t("providers.commandcode_usage_title")}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {t("providers.commandcode_usage_hint")}
            </p>
          </FieldGroup>
        </>
      ) : null}

      {hasDashboardUsage ? (
        <FieldGroup>
          <p className="text-sm font-semibold text-ink">
            {dashboardUsageTitle}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {dashboardUsageHint}
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-1">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-2">
                {t("providers.opencode_go_auth_cookie")}
              </p>
              <TextInput
                type="password"
                value={keyDraft.authCookie}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, authCookie: val }));
                }}
                placeholder={t("providers.dashboard_auth_cookie_placeholder")}
              />
            </div>
          </div>
        </FieldGroup>
      ) : null}

      {isOpenCodeGo || isCline || isOllamaCloud || isCommandCode ? (
        <FieldGroup>
          <p className="text-sm font-semibold text-ink">
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
          <p className="mt-2 text-xs text-ink-3">
            {t("providers.opencode_go_vision_fallback_hint")}
          </p>
        </FieldGroup>
      ) : null}

      {isBedrock ? (
        <FieldGroup>
          <p className="text-sm font-semibold text-ink">
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
          <p className="mt-2 text-xs text-ink-3">
            {t("providers.bedrock_region_hint")}
          </p>
        </FieldGroup>
      ) : null}

      <FieldGroup>
        <p className="text-sm font-semibold text-ink">
          {t("providers.connection_proxy_label")}
        </p>
        <div className="mt-3 grid gap-3">
          {isOpenCodeGo ? null : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-2">
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
          <ProxyUrlInput
            collapsible
            label={t("providers.proxy_url")}
            description={t("providers.proxy_url_fallback_hint")}
            value={keyDraft.proxyUrl}
            onChange={(proxyUrl) => setKeyDraft((prev) => ({ ...prev, proxyUrl }))}
          />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {isOpenCodeGo
            ? t("providers.opencode_go_connection_hint")
            : isCline
              ? t("providers.cline_connection_hint")
              : t("providers.connection_proxy_hint")}
        </p>
      </FieldGroup>

      <FieldGroup>
        <KeyValueInputList
          title={t("providers.headers_optional")}
          entries={keyDraft.headersEntries}
          onChange={(next) => setKeyDraft((prev) => ({ ...prev, headersEntries: next }))}
          keyPlaceholder={t("providers.header_name_placeholder")}
          valuePlaceholder={t("providers.header_value_placeholder")}
        />
        <p className="mt-2 text-xs text-ink-3">
          {t("providers.headers_common_hint")}
        </p>
      </FieldGroup>

      {editKeyType === "claude" ? (
        <FieldGroup>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">
                {t("providers.anthropic_processing_label")}
              </p>
              <p className="mt-1 text-xs text-ink-3">
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
        </FieldGroup>
      ) : null}
    </div>
  );
}
