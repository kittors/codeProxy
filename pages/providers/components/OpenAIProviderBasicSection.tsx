import { useTranslation } from "react-i18next";
import { TextInput } from "@code-proxy/ui";
import { KeyValueInputList } from "../KeyValueInputList";
import { buildModelsEndpoint } from "../providers-helpers";
import type { OpenAIDraft } from "../providers-helpers";

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
    {children}
  </div>
);

interface OpenAIProviderBasicSectionProps {
  openaiDraft: OpenAIDraft;
  setOpenaiDraft: (value: React.SetStateAction<OpenAIDraft>) => void;
}

export function OpenAIProviderBasicSection({
  openaiDraft,
  setOpenaiDraft,
}: OpenAIProviderBasicSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <SectionCard>
        {openaiDraft.id ? (
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
            <p className="text-xs font-semibold text-slate-500 dark:text-white/55">
              {t("content_moderation.channel_id")}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-white/75">
              {openaiDraft.id}
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.name")}
            </p>
            <TextInput
              value={openaiDraft.name}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, name: value }));
              }}
              placeholder={t("providers.name_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.base_url")}
            </p>
            <TextInput
              value={openaiDraft.baseUrl}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, baseUrl: value }));
              }}
              placeholder={t("providers.base_url_placeholder")}
            />
            <p className="text-xs text-slate-500 dark:text-white/55">
              {t("providers.models_fetch_url")}
              {openaiDraft.baseUrl.trim() ? buildModelsEndpoint(openaiDraft.baseUrl) : "--"}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.prefix_optional")}
            </p>
            <TextInput
              value={openaiDraft.prefix}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, prefix: value }));
              }}
              placeholder={t("providers.prefix_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.priority_label")}
            </p>
            <TextInput
              value={openaiDraft.priorityText}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, priorityText: value }));
              }}
              placeholder={t("providers.priority_placeholder")}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.test_model_label")}
            </p>
            <TextInput
              value={openaiDraft.testModel}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, testModel: value }));
              }}
              placeholder={t("providers.test_model_placeholder")}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <KeyValueInputList
          title={t("providers.provider_headers")}
          entries={openaiDraft.headersEntries}
          onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, headersEntries: next }))}
        />
      </SectionCard>
    </div>
  );
}
