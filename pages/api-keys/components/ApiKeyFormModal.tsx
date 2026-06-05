import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { ApiKeyFormFields } from "./ApiKeyFormFields";
import type { ApiKeyFormValues } from "../types";
import type { SelectOption } from "@code-proxy/ui";

export function ApiKeyFormModal({
  t,
  open,
  editMode,
  saving,
  form,
  setForm,
  permissionProfileOptions,
  onClose,
  onSubmit,
  regenerateKey,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  editMode: boolean;
  saving: boolean;
  form: ApiKeyFormValues;
  setForm: React.Dispatch<React.SetStateAction<ApiKeyFormValues>>;
  permissionProfileOptions: SelectOption[];
  onClose: () => void;
  onSubmit: () => Promise<void>;
  regenerateKey: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editMode ? t("api_keys_page.edit") : t("api_keys_page.create")}
      description={editMode ? t("api_keys_page.edit_desc") : t("api_keys_page.create_desc")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("api_keys_page.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void onSubmit()} disabled={saving}>
            {editMode
              ? saving
                ? t("api_keys_page.saving")
                : t("api_keys_page.save_btn")
              : saving
                ? t("api_keys_page.creating")
                : t("api_keys_page.create_btn")}
          </Button>
        </>
      }
    >
      <ApiKeyFormFields
        t={t}
        form={form}
        setForm={setForm}
        editMode={editMode}
        permissionProfileOptions={permissionProfileOptions}
        regenerateKey={regenerateKey}
      />
    </Modal>
  );
}
