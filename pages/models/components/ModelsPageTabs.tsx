import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import type { ModelPageTab } from "../types";

interface ModelsPageTabsProps {
  activeTab: ModelPageTab;
  onTabChange: (tab: ModelPageTab) => void;
  /** Only when the backend advertises virtual models. */
  showVirtual?: boolean;
}

export function ModelsPageTabs({
  activeTab,
  onTabChange,
  showVirtual = false,
}: ModelsPageTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex">
      <Tabs value={activeTab} onValueChange={(next) => onTabChange(next as ModelPageTab)} size="sm">
        <TabsList>
          <TabsTrigger value="active">{t("models_page.tab_active_models")}</TabsTrigger>
          <TabsTrigger value="library">{t("models_page.tab_model_library")}</TabsTrigger>
          {showVirtual ? (
            <TabsTrigger value="virtual">{t("models_page.virtual.tab")}</TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>
    </div>
  );
}
