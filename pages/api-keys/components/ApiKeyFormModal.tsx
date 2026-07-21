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
  serverGeneratesKey = false,
  hidePermissionProfile = false,
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
  serverGeneratesKey?: boolean;
  hidePermissionProfile?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editMode ? t("api_keys_page.edit") : t("api_keys_page.create")}
      description={
        editMode
          ? serverGeneratesKey
            ? t("end_users.edit_key_name_desc", {
                defaultValue: "仅修改密钥名称；如需更换密钥值，请使用独立的轮换操作。",
              })
            : t("api_keys_page.edit_desc")
          : t("api_keys_page.create_desc")
      }
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
        serverGeneratesKey={serverGeneratesKey}
        hidePermissionProfile={hidePermissionProfile}
      />
    </Modal>
  );
}
