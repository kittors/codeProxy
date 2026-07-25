import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { TextInput } from "@code-proxy/ui";
import { Select } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import type { ProviderKeyDraft } from "../providers-helpers";

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
    {children}
  </div>
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

  return (
    <div className="space-y-4">
      {statusBadges}

      {keyDraft.id ? (
        <SectionCard>
          <p className="text-xs font-semibold text-slate-500 dark:text-white/55">
            {t("content_moderation.channel_id")}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-white/75">
            {keyDraft.id}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
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
        <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
          {t("providers.channel_name_hint")}
        </p>
      </SectionCard>

      <SectionCard>
        <ToggleSwitch
          label={t("providers.enable")}
          description={
            editKeyEnabled
              ? t("providers.enable_toggle_desc_on")
              : t("providers.enable_toggle_desc_off")
          }
          checked={editKeyEnabled}
          onCheckedChange={editKeyEnabledToggle}
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
          {t("providers.disable_hint")}
        </p>
      </SectionCard>

      {isBedrock ? (
        <SectionCard>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
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
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.bedrock_auth_mode_hint")}
          </p>
        </SectionCard>
      ) : null}

      {!isBedrockSigV4 ? (
        <SectionCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {isBedrock ? t("providers.bedrock_auth_api_key") : t("providers.api_key")}
            </p>
            <span className="text-xs text-slate-500 dark:text-white/55">
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
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-slate-200 dark:hover:bg-neutral-950"
                  aria-label={t("providers.copy_api_key")}
                  title={t("providers.copy")}
                >
                  <Copy size={14} />
                </button>
              }
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {isBedrock ? t("providers.bedrock_api_key_hint") : t("providers.api_key_hint")}
          </p>
        </SectionCard>
      ) : null}

      {isBedrockSigV4 ? (
        <SectionCard>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.bedrock_sigv4_credentials")}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
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
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
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
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
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
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.bedrock_sigv4_hint")}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
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
        <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
          {t("providers.prefix_hint")}
        </p>
      </SectionCard>
    </div>
  );
}
