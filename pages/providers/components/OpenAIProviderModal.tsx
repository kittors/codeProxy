import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { OpenAIDraft } from "../providers-helpers";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { OpenAIProviderBasicSection } from "./OpenAIProviderBasicSection";
import { OpenAIKeyEntriesEditor } from "./OpenAIKeyEntriesEditor";
import { OpenAIProviderModelsSection } from "./OpenAIProviderModelsSection";
import { ModerationProfileSelect } from "@pages/content-moderation/components/ModerationProfileSelect";

interface OpenAIProviderModalProps {
  open: boolean;
  editOpenAIIndex: number | null;
  openaiDraft: OpenAIDraft;
  setOpenaiDraft: Dispatch<SetStateAction<OpenAIDraft>>;
  openaiDraftError: string | null;
  closeOpenAIEditor: () => void;
  saveOpenAIDraft: () => Promise<void>;
  discovering: boolean;
  discoverModels: () => Promise<void>;
  applyDiscoveredModels: () => void;
  discoveredModels: { id: string; owned_by?: string }[];
  discoverSelected: Set<string>;
  setDiscoverSelected: Dispatch<SetStateAction<Set<string>>>;
  proxyPoolEntries: ProxyPoolEntry[];
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

export function OpenAIProviderModal({
  open,
  editOpenAIIndex,
  openaiDraft,
  setOpenaiDraft,
  openaiDraftError,
  closeOpenAIEditor,
  saveOpenAIDraft,
  discovering,
  discoverModels,
  applyDiscoveredModels,
  discoveredModels,
  discoverSelected,
  setDiscoverSelected,
  proxyPoolEntries,
  copyText,
  maskApiKey,
}: OpenAIProviderModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) {
      setDiscoverSelected(new Set());
    }
  }, [editOpenAIIndex, open, setDiscoverSelected]);

  return (
    <Modal
      open={open}
      title={
        editOpenAIIndex === null
          ? t("providers.add_openai_provider")
          : t("providers.edit_openai_provider")
      }
      description={t("providers.openai_config_desc")}
      onClose={closeOpenAIEditor}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {openaiDraftError ? (
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
              {openaiDraftError}
            </span>
          ) : null}
          <Button variant="secondary" onClick={closeOpenAIEditor}>
            {t("providers.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void saveOpenAIDraft()}>
            <Check size={14} />
            {t("providers.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <OpenAIProviderBasicSection openaiDraft={openaiDraft} setOpenaiDraft={setOpenaiDraft} />

        <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <ModerationProfileSelect
            channelType="provider"
            channelId={openaiDraft.id}
            label={t("content_moderation.provider_default_profile_label")}
            hint={t("content_moderation.provider_default_profile_hint")}
            unpersistedHint={t("content_moderation.provider_default_profile_save_first")}
          />
        </div>

        <div className="border-t border-slate-200/60 pt-5 dark:border-neutral-800/60">
          <OpenAIKeyEntriesEditor
            openaiDraft={openaiDraft}
            setOpenaiDraft={setOpenaiDraft}
            proxyPoolEntries={proxyPoolEntries}
            copyText={copyText}
            maskApiKey={maskApiKey}
          />
        </div>

        <div className="border-t border-slate-200/60 pt-5 dark:border-neutral-800/60">
          <OpenAIProviderModelsSection
            openaiDraft={openaiDraft}
            setOpenaiDraft={setOpenaiDraft}
            discovering={discovering}
            discoverModels={discoverModels}
            applyDiscoveredModels={applyDiscoveredModels}
            discoveredModels={discoveredModels}
            discoverSelected={discoverSelected}
            setDiscoverSelected={setDiscoverSelected}
          />
        </div>
      </div>
    </Modal>
  );
}
