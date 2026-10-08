import { Tag } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  FormField,
  Modal,
  rules,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
  useFormValidation,
} from "@code-proxy/ui";
import type { OwnerFormState } from "../types";

const FORM_ID = "owner-preset-form";

interface OwnerFormModalProps {
  ownerForm: OwnerFormState | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onUpdateOwnerForm: (patch: Partial<OwnerFormState>) => void;
}

/**
 * 新增 / 编辑归属预设：标识是写进模型配置的值（小写、无空格），名称是下拉里给人看的。
 * 两个都必填、就地校验；回车保存。
 */
export function OwnerFormModal({
  ownerForm,
  saving,
  onClose,
  onSave,
  onUpdateOwnerForm,
}: OwnerFormModalProps) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const open = ownerForm !== null;
  const validation = useFormValidation(
    ownerForm ?? { value: "", label: "", description: "", enabled: true, originalValue: "" },
    {
      value: [rules.required(), rules.pattern(/^\S+$/, "no_spaces"), rules.maxLength(64)],
      label: [rules.required(), rules.maxLength(64)],
    },
  );
  const { reset } = validation;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSave();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ownerForm?.originalValue ? t("models_page.edit_owner") : t("models_page.add_owner")}
      description={t("models_page.owner_form_desc")}
      icon={<Tag />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("models_page.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {t("models_page.save")}
          </Button>
        </>
      }
    >
      {ownerForm ? (
        <form
          ref={formRef}
          id={FORM_ID}
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField
              label={t("models_page.owner_value")}
              htmlFor="owner-preset-value"
              required
              description={t("models_page.owner_value_hint")}
              error={validation.error("value")}
            >
              <TextInput
                value={ownerForm.value}
                onChange={(event) => onUpdateOwnerForm({ value: event.target.value })}
                {...validation.bind("value")}
                placeholder="openai"
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
            </FormField>
            <FormField
              label={t("models_page.owner_label")}
              htmlFor="owner-preset-label"
              required
              description={t("models_page.owner_label_hint")}
              error={validation.error("label")}
            >
              <TextInput
                value={ownerForm.label}
                onChange={(event) => onUpdateOwnerForm({ label: event.target.value })}
                {...validation.bind("label")}
                placeholder="OpenAI"
              />
            </FormField>
          </div>
          <FormField
            label={t("models_page.owner_description")}
            htmlFor="owner-preset-description"
            optional
            reserveMeta={false}
          >
            <TextInput
              value={ownerForm.description}
              onChange={(event) => onUpdateOwnerForm({ description: event.target.value })}
              placeholder={t("models_page.owner_description_placeholder")}
            />
          </FormField>
          <SettingGroup flat>
            <SettingRow
              label={t("models_page.enabled")}
              description={t("models_page.owner_enabled_hint")}
              controlWidth="auto"
              control={
                <ToggleSwitch
                  checked={ownerForm.enabled}
                  onCheckedChange={(enabled) => onUpdateOwnerForm({ enabled })}
                  ariaLabel={t("models_page.enabled")}
                />
              }
            />
          </SettingGroup>
        </form>
      ) : null}
    </Modal>
  );
}
