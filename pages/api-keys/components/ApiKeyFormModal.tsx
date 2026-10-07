import { useEffect, useRef } from "react";
import { KeyRound } from "lucide-react";
import {
  Button,
  Modal,
  rules,
  useFormValidation,
  type SelectOption,
} from "@code-proxy/ui";
import { ApiKeyFormFields } from "./ApiKeyFormFields";
import type { ApiKeyFormValues } from "../types";

/**
 * 管理员新建 / 编辑 API Key。名称与 Key 值必填，在字段下就地报错（以前只弹一条 toast）；
 * 回车即提交。账号名下的 Key 不走这里（见 OwnedApiKeyQuotaModal）。
 */
export function ApiKeyFormModal({
  t,
  open,
  editMode,
  saving,
  form,
  setForm,
  originalKey,
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
  originalKey?: string;
  permissionProfileOptions: SelectOption[];
  onClose: () => void;
  onSubmit: () => Promise<void>;
  regenerateKey: () => void;
}) {
  // 新建与编辑两个实例会同时挂在页面上，表单 id 要区分开。
  const formId = editMode ? "api-key-edit-form" : "api-key-create-form";
  const formRef = useRef<HTMLFormElement | null>(null);
  const validation = useFormValidation(form, {
    name: [rules.required()],
    key: [rules.required()],
  });
  const { reset } = validation;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editMode ? t("api_keys_page.edit") : t("api_keys_page.create")}
      description={editMode ? t("api_keys_page.edit_desc") : t("api_keys_page.create_desc")}
      icon={<KeyRound />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("api_keys_page.cancel")}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {editMode ? t("api_keys_page.save_btn") : t("api_keys_page.create_btn")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={formId}
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validation.validate()) {
            validation.focusFirstInvalid(formRef.current);
            return;
          }
          void onSubmit();
        }}
      >
        <ApiKeyFormFields
          t={t}
          form={form}
          setForm={setForm}
          editMode={editMode}
          originalKey={originalKey}
          permissionProfileOptions={permissionProfileOptions}
          regenerateKey={regenerateKey}
          errors={{ name: validation.error("name"), key: validation.error("key") }}
          onFieldBlur={validation.touch}
        />
      </form>
    </Modal>
  );
}
