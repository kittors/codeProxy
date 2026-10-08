import { useTranslation } from "react-i18next";
import { ModelInputList } from "../ModelInputList";
import type { OpenAIDraft } from "../providers-helpers";
import { OpenAIModelDiscoveryPanel } from "./OpenAIModelDiscoveryPanel";

/**
 * 一组字段。弹窗本身就是一层，组与组之间靠留白分开，不再各自套一张描边卡片——以前一个页签里
 * 叠着五六张描边小卡，读起来像一摞框。
 */
const FieldGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

interface OpenAIProviderModelsSectionProps {
  openaiDraft: OpenAIDraft;
  setOpenaiDraft: (value: React.SetStateAction<OpenAIDraft>) => void;
  discovering: boolean;
  discoverModels: () => Promise<void>;
  applyDiscoveredModels: () => void;
  discoveredModels: { id: string; owned_by?: string }[];
  discoverSelected: Set<string>;
  setDiscoverSelected: (value: React.SetStateAction<Set<string>>) => void;
}

export function OpenAIProviderModelsSection({
  openaiDraft,
  setOpenaiDraft,
  discovering,
  discoverModels,
  applyDiscoveredModels,
  discoveredModels,
  discoverSelected,
  setDiscoverSelected,
}: OpenAIProviderModelsSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <FieldGroup>
        <ModelInputList
          title={t("providers.models_optional")}
          entries={openaiDraft.modelEntries}
          onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, modelEntries: next }))}
          showPriority
          showTestModel
        />
      </FieldGroup>

      <FieldGroup>
        <OpenAIModelDiscoveryPanel
          discovering={discovering}
          discoverModels={discoverModels}
          applyDiscoveredModels={applyDiscoveredModels}
          discoveredModels={discoveredModels}
          discoverSelected={discoverSelected}
          setDiscoverSelected={setDiscoverSelected}
        />
      </FieldGroup>
    </section>
  );
}
