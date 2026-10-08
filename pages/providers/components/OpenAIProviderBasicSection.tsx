import { useTranslation } from "react-i18next";
import { TextInput } from "@code-proxy/ui";
import { KeyValueInputList } from "../KeyValueInputList";
import { buildModelsEndpoint } from "../providers-helpers";
import type { OpenAIDraft } from "../providers-helpers";

/**
 * 一组字段。弹窗本身就是一层，组与组之间靠留白分开，不再各自套一张描边卡片——以前一个页签里
 * 叠着五六张描边小卡，读起来像一摞框。
 */
const FieldGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

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
    <div className="space-y-6">
      <FieldGroup>
        {openaiDraft.id ? (
          <div className="mb-4 rounded-xl bg-subtle px-4 py-3">
            <p className="text-xs font-semibold text-ink-3">
              {t("content_moderation.channel_id")}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink-2">
              {openaiDraft.id}
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">
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
            <p className="text-sm font-semibold text-ink">
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
            <p className="text-xs text-ink-3">
              {t("providers.models_fetch_url")}
              {openaiDraft.baseUrl.trim() ? buildModelsEndpoint(openaiDraft.baseUrl) : "--"}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">
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
            <p className="text-sm font-semibold text-ink">
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
            <p className="text-sm font-semibold text-ink">
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
      </FieldGroup>

      <FieldGroup>
        <KeyValueInputList
          title={t("providers.provider_headers")}
          entries={openaiDraft.headersEntries}
          onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, headersEntries: next }))}
        />
      </FieldGroup>
    </div>
  );
}
