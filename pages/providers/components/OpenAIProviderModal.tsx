import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Plug } from "lucide-react";
import type { OpenAIDraft } from "../providers-helpers";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { OpenAIProviderBasicSection } from "./OpenAIProviderBasicSection";
import { OpenAIKeyEntriesEditor } from "./OpenAIKeyEntriesEditor";
import { OpenAIProviderModelsSection } from "./OpenAIProviderModelsSection";
import { ModerationProfileSelect } from "@features/content-moderation";
import { useModerationPermissions } from "@app/providers/useModerationPermissions";

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
  const moderationPerms = useModerationPermissions();

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
      icon={<Plug />}
      onClose={closeOpenAIEditor}
      footerStart={
        openaiDraftError ? (
          <span role="alert" className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 dark:text-rose-400">
            <AlertCircle size={15} aria-hidden="true" />
            {openaiDraftError}
          </span>
        ) : null
      }
      footer={
        <>
          <Button variant="secondary" onClick={closeOpenAIEditor}>
            {t("providers.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void saveOpenAIDraft()}>
            <Check size={14} />
            {t("providers.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <OpenAIProviderBasicSection openaiDraft={openaiDraft} setOpenaiDraft={setOpenaiDraft} />

        {/* 弹窗里只有一层：审核配置用无边淡底分组，分区之间靠留白，不再画分隔线、套描边卡。 */}
        <div className="rounded-2xl bg-subtle p-4">
          <ModerationProfileSelect
            canRead={moderationPerms.canRead}
            canWrite={moderationPerms.canWrite}
            channelType="provider"
            channelId={openaiDraft.id}
            label={t("content_moderation.provider_default_profile_label")}
            hint={t("content_moderation.provider_default_profile_hint")}
            unpersistedHint={t("content_moderation.provider_default_profile_save_first")}
          />
        </div>

        <div className="pt-4">
          <OpenAIKeyEntriesEditor
            openaiDraft={openaiDraft}
            setOpenaiDraft={setOpenaiDraft}
            proxyPoolEntries={proxyPoolEntries}
            copyText={copyText}
            maskApiKey={maskApiKey}
          />
        </div>

        <div className="pt-4">
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
