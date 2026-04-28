import type { TFunction } from "i18next";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";
import { CcSwitchImportOptions } from "@/modules/ccswitch/CcSwitchImportOptions";
import type { CcSwitchClientType } from "@/modules/ccswitch/ccswitchImport";

export function CcSwitchImportModal({
  t,
  open,
  models = [],
  onClose,
  onSelect,
}: {
  t: TFunction;
  open: boolean;
  models?: readonly string[];
  onClose: () => void;
  onSelect: (clientType: CcSwitchClientType) => void;
}) {
  return (
    <Modal
      open={open}
      title={t("ccswitch.import_to_ccswitch")}
      description={t("ccswitch.import_modal_desc")}
      maxWidth="max-w-xl"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      }
    >
      <CcSwitchImportOptions t={t} models={models} onSelect={onSelect} />
    </Modal>
  );
}
