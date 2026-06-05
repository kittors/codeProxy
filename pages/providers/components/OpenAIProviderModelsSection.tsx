import { useTranslation } from "react-i18next";
import { ModelInputList } from "../ModelInputList";
import type { OpenAIDraft } from "../providers-helpers";
import { OpenAIModelDiscoveryPanel } from "./OpenAIModelDiscoveryPanel";

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
    {children}
  </div>
);

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
    <section className="space-y-3">
      <SectionCard>
        <ModelInputList
          title={t("providers.models_optional")}
          entries={openaiDraft.modelEntries}
          onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, modelEntries: next }))}
          showPriority
          showTestModel
        />
      </SectionCard>

      <SectionCard>
        <OpenAIModelDiscoveryPanel
          discovering={discovering}
          discoverModels={discoverModels}
          applyDiscoveredModels={applyDiscoveredModels}
          discoveredModels={discoveredModels}
          discoverSelected={discoverSelected}
          setDiscoverSelected={setDiscoverSelected}
        />
      </SectionCard>
    </section>
  );
}
