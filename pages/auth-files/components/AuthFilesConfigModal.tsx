import type { ReactNode } from "react";
import { Button, Modal, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import type { AuthFilesConfigModalTab } from "../AuthFilesPage";
import type { TFunction } from "i18next";

interface AuthFilesConfigModalProps {
  configModalTab: AuthFilesConfigModalTab | null;
  setConfigModalTab: (tab: AuthFilesConfigModalTab) => void;
  closeConfigModal: () => void;
  saveConfigModal: () => Promise<void>;
  configSaving: boolean;
  excludedLoading: boolean;
  aliasLoading: boolean;
  isPending: boolean;
  oauthExcludedEnabled: boolean;
  t: TFunction;
  aliasContent: ReactNode;
  excludedContent: ReactNode;
}

export function AuthFilesConfigModal({
  configModalTab,
  setConfigModalTab,
  closeConfigModal,
  saveConfigModal,
  configSaving,
  excludedLoading,
  aliasLoading,
  isPending,
  oauthExcludedEnabled,
  t,
  aliasContent,
  excludedContent,
}: AuthFilesConfigModalProps) {
  if (configModalTab === null) return null;

  return (
    <Modal
      open={configModalTab !== null}
      title={
        configModalTab === "alias"
          ? t("auth_files_page.alias_title")
          : t("auth_files_page.excluded_title")
      }
      description={
        configModalTab === "alias"
          ? t("auth_files.model_alias_desc")
          : t("auth_files_page.excluded_desc")
      }
      maxWidth="max-w-5xl"
      bodyHeightClassName="h-[76vh] max-h-[76vh]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="flex min-h-0 flex-col"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={closeConfigModal}
            disabled={configSaving}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void saveConfigModal()}
            disabled={configSaving || excludedLoading || aliasLoading || isPending}
          >
            {configSaving ? t("common.saving") : t("auth_files.save")}
          </Button>
        </>
      }
      onClose={closeConfigModal}
    >
      <Tabs
        value={configModalTab}
        onValueChange={(next) => setConfigModalTab(next as AuthFilesConfigModalTab)}
        size="sm"
      >
        <div className="mb-4 flex shrink-0 justify-start">
          <TabsList>
            {oauthExcludedEnabled ? (
              <TabsTrigger value="excluded">
                {t("auth_files_page.excluded_tab")}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="alias">
              {t("auth_files_page.alias_tab")}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {configModalTab === "excluded" ? excludedContent : aliasContent}
        </div>
      </Tabs>
    </Modal>
  );
}
