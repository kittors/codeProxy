import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { TextInput } from "@code-proxy/ui";
import { Select } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import type { ProviderKeyDraft } from "../providers-helpers";
import { isModelAccessProvider } from "../provider-model-access";

/**
 * 一组字段。弹窗本身就是一层，组与组之间靠留白分开，不再各自套一张描边卡片——以前一个页签里
 * 叠着五六张描边小卡，读起来像一摞框。只读的渠道 ID 传 `well`，用无边淡底和可编辑的字段区分开。
 */
const FieldGroup = ({ children, well = false }: { children: React.ReactNode; well?: boolean }) => (
  <div className={well ? "rounded-xl bg-subtle px-4 py-3" : undefined}>{children}</div>
);

interface ProviderKeyBasicTabProps {
  keyDraft: ProviderKeyDraft;
  setKeyDraft: Dispatch<SetStateAction<ProviderKeyDraft>>;
  editKeyType: string;
  editKeyEnabled: boolean;
  editKeyEnabledToggle: (checked: boolean) => void;
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
  statusBadges: React.ReactNode;
}

export function ProviderKeyBasicTab({
  keyDraft,
  setKeyDraft,
  editKeyType,
  editKeyEnabled,
  editKeyEnabledToggle,
  copyText,
  maskApiKey,
  statusBadges,
}: ProviderKeyBasicTabProps) {
  const { t } = useTranslation();
  const isBedrock = editKeyType === "bedrock";
  const isBedrockSigV4 = isBedrock && keyDraft.authMode === "sigv4";
  // Providers with an explicit `disabled` field are switched off outright; the
  // rest are switched off by writing a "*" exclude rule, and the copy has to say
  // which one is happening.
  const usesDisabledFlag = isModelAccessProvider(editKeyType);

  return (
    <div className="space-y-6">
      {statusBadges}

      {keyDraft.id ? (
        <FieldGroup well>
          <p className="text-xs font-semibold text-ink-3">
            {t("content_moderation.channel_id")}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-ink-2">
            {keyDraft.id}
          </p>
        </FieldGroup>
      ) : null}

      <FieldGroup>
        <p className="text-sm font-semibold text-ink">
          {t("providers.channel_name_label")}
        </p>
        <div className="mt-2">
          <TextInput
            value={keyDraft.name}
            onChange={(e) => {
              const val = e.currentTarget.value;
              setKeyDraft((prev) => ({ ...prev, name: val }));
            }}
            placeholder={t("providers.channel_placeholder")}
          />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {t("providers.channel_name_hint")}
        </p>
      </FieldGroup>

      <FieldGroup>
        <ToggleSwitch
          label={t("providers.enable")}
          description={
            editKeyEnabled
              ? t("providers.enable_toggle_desc_on")
              : t(
                  usesDisabledFlag
                    ? "providers.enable_toggle_desc_off_flag"
                    : "providers.enable_toggle_desc_off",
                )
          }
          checked={editKeyEnabled}
          onCheckedChange={editKeyEnabledToggle}
        />
        <p className="mt-2 text-xs text-ink-3">
          {t(usesDisabledFlag ? "providers.disable_hint_flag" : "providers.disable_hint")}
        </p>
      </FieldGroup>

      {isBedrock ? (
        <FieldGroup>
          <p className="text-sm font-semibold text-ink">
            {t("providers.bedrock_auth_mode")}
          </p>
          <div className="mt-2">
            <Select
              value={keyDraft.authMode}
              onChange={(value) =>
                setKeyDraft((prev) => ({
                  ...prev,
                  authMode: value === "sigv4" ? "sigv4" : "api-key",
                }))
              }
              options={[
                { value: "api-key", label: t("providers.bedrock_auth_api_key") },
                { value: "sigv4", label: t("providers.bedrock_auth_sigv4") },
              ]}
              aria-label={t("providers.bedrock_auth_mode")}
            />
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {t("providers.bedrock_auth_mode_hint")}
          </p>
        </FieldGroup>
      ) : null}

      {!isBedrockSigV4 ? (
        <FieldGroup>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">
              {isBedrock ? t("providers.bedrock_auth_api_key") : t("providers.api_key")}
            </p>
            <span className="text-xs text-ink-3">
              {t("providers.show_masked_key", { key: maskApiKey(keyDraft.apiKey) })}
            </span>
          </div>
          <div className="mt-2">
            <TextInput
              value={keyDraft.apiKey}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, apiKey: val }));
              }}
              placeholder={t("providers.paste_key")}
              endAdornment={
                <button
                  type="button"
                  onClick={() => void copyText(keyDraft.apiKey.trim())}
                  disabled={!keyDraft.apiKey.trim()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
                  aria-label={t("providers.copy_api_key")}
                  title={t("providers.copy")}
                >
                  <Copy size={14} />
                </button>
              }
            />
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {isBedrock ? t("providers.bedrock_api_key_hint") : t("providers.api_key_hint")}
          </p>
        </FieldGroup>
      ) : null}

      {isBedrockSigV4 ? (
        <FieldGroup>
          <p className="text-sm font-semibold text-ink">
            {t("providers.bedrock_sigv4_credentials")}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-2">
                {t("providers.bedrock_access_key_id")}
              </p>
              <TextInput
                value={keyDraft.accessKeyId}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, accessKeyId: val }));
                }}
                placeholder="AKIA..."
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-2">
                {t("providers.bedrock_secret_access_key")}
              </p>
              <TextInput
                type="password"
                value={keyDraft.secretAccessKey}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, secretAccessKey: val }));
                }}
                placeholder={t("providers.bedrock_secret_placeholder")}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-xs font-semibold text-ink-2">
                {t("providers.bedrock_session_token")}
              </p>
              <TextInput
                value={keyDraft.sessionToken}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, sessionToken: val }));
                }}
                placeholder={t("providers.bedrock_session_placeholder")}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {t("providers.bedrock_sigv4_hint")}
          </p>
        </FieldGroup>
      ) : null}

      <FieldGroup>
        <p className="text-sm font-semibold text-ink">
          {t("providers.prefix_label")}
        </p>
        <div className="mt-2">
          <TextInput
            value={keyDraft.prefix}
            onChange={(e) => {
              const val = e.currentTarget.value;
              setKeyDraft((prev) => ({ ...prev, prefix: val }));
            }}
            placeholder={t("providers.prefix_placeholder")}
          />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {t("providers.prefix_hint")}
        </p>
      </FieldGroup>
    </div>
  );
}
