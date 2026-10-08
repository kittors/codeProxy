import { useTranslation } from "react-i18next";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { KeyValueInputList } from "../KeyValueInputList";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { ProxyPoolSelect, ProxyUrlInput } from "@features/proxy-pool";
import type { OpenAIDraft } from "../providers-helpers";
import { ModerationProfileSelect } from "@features/content-moderation";
import { useModerationPermissions } from "@app/providers/useModerationPermissions";

/**
 * 一条密钥：可以有很多条、结构相同，用一层无边淡底把每条框在一起（不描边、不投影）；
 * 条目里面的审核配置不再垫第二层底。
 */
const FieldGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl bg-subtle p-4">{children}</div>
);

interface OpenAIKeyEntriesEditorProps {
  openaiDraft: OpenAIDraft;
  setOpenaiDraft: (value: React.SetStateAction<OpenAIDraft>) => void;
  proxyPoolEntries: ProxyPoolEntry[];
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

export function OpenAIKeyEntriesEditor({
  openaiDraft,
  setOpenaiDraft,
  proxyPoolEntries,
  copyText,
  maskApiKey,
}: OpenAIKeyEntriesEditorProps) {
  const { t } = useTranslation();
  const moderationPerms = useModerationPermissions();

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {t("providers.api_key_entries")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setOpenaiDraft((prev) => ({
              ...prev,
              apiKeyEntries: [
                ...prev.apiKeyEntries,
                {
                  id: `key-${Date.now()}`,
                  apiKey: "",
                  disabled: false,
                  proxyUrl: "",
                  proxyId: "",
                  headersEntries: [],
                },
              ],
            }))
          }
        >
          <Plus size={14} />
          {t("providers.add")}
        </Button>
      </div>

      <div className="space-y-3">
        {openaiDraft.apiKeyEntries.map((entry, idx) => (
          <FieldGroup key={entry.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-ink">
                  {t("providers.key_number", { num: idx + 1 })}
                </p>
                {entry.channelId ? (
                  <span className="max-w-full truncate font-mono text-xs text-ink-3" title={entry.channelId}>
                    {entry.channelId}
                  </span>
                ) : null}
                <ToggleSwitch
                  checked={!entry.disabled}
                  ariaLabel={`${t("providers.enable_key_entry")} ${idx + 1}`}
                  onCheckedChange={(enabled) => {
                    setOpenaiDraft((prev) => ({
                      ...prev,
                      apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                        i === idx ? { ...it, disabled: !enabled } : it,
                      ),
                    }));
                  }}
                />
                <span className="text-xs font-semibold text-ink-3">
                  {!entry.disabled ? t("providers.enabled") : t("providers.disabled")}
                </span>
              </div>
              <Button
                variant="ghost-danger"
                size="sm"
                onClick={() =>
                  setOpenaiDraft((prev) => ({
                    ...prev,
                    apiKeyEntries: prev.apiKeyEntries.filter((_, i) => i !== idx),
                  }))
                }
                disabled={openaiDraft.apiKeyEntries.length <= 1}
              >
                <Trash2 size={14} />
                {t("providers.delete")}
              </Button>
            </div>

            <div className="mt-4">
              <ModerationProfileSelect
        canRead={moderationPerms.canRead}
        canWrite={moderationPerms.canWrite}
                channelType="provider_key"
                channelId={entry.channelId ?? ""}
                label={t("content_moderation.provider_key_override_profile_label")}
                hint={t("content_moderation.provider_key_override_profile_hint")}
                unpersistedHint={t("content_moderation.provider_key_profile_save_first")}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">
                  {t("providers.api_key")}
                </p>
                <TextInput
                  value={entry.apiKey}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setOpenaiDraft((prev) => ({
                      ...prev,
                      apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                        i === idx ? { ...it, apiKey: value } : it,
                      ),
                    }));
                  }}
                  placeholder={t("providers.api_key_placeholder")}
                />
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>{t("providers.show_masked_key", { key: maskApiKey(entry.apiKey) })}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyText(entry.apiKey.trim())}
                    disabled={!entry.apiKey.trim()}
                  >
                    <Copy size={14} />
                    {t("providers.copy")}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <ProxyPoolSelect
                  value={entry.proxyId}
                  entries={proxyPoolEntries}
                  onChange={(value) => {
                    setOpenaiDraft((prev) => ({
                      ...prev,
                      apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                        i === idx ? { ...it, proxyId: value } : it,
                      ),
                    }));
                  }}
                  label={t("providers.proxy_pool_label")}
                  hint={t("providers.proxy_pool_hint")}
                  ariaLabel={`${t("providers.proxy_pool_label")} ${idx + 1}`}
                />
              </div>
              <ProxyUrlInput
                collapsible
                label={t("providers.proxy_url")}
                description={t("providers.proxy_url_fallback_hint")}
                value={entry.proxyUrl}
                onChange={(value) => {
                  setOpenaiDraft((prev) => ({
                    ...prev,
                    apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                      i === idx ? { ...it, proxyUrl: value } : it,
                    ),
                  }));
                }}
              />
            </div>

            <div className="mt-3">
              <KeyValueInputList
                title={t("providers.key_headers")}
                entries={entry.headersEntries}
                onChange={(next) => {
                  setOpenaiDraft((prev) => ({
                    ...prev,
                    apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                      i === idx ? { ...it, headersEntries: next } : it,
                    ),
                  }));
                }}
              />
            </div>
          </FieldGroup>
        ))}
      </div>
    </section>
  );
}
