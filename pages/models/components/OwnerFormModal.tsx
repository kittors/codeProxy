import { useTranslation } from "react-i18next";
import { Button, Modal, TextInput, ToggleSwitch } from "@code-proxy/ui";
import type { OwnerFormState } from "../types";

interface OwnerFormModalProps {
  ownerForm: OwnerFormState | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onUpdateOwnerForm: (patch: Partial<OwnerFormState>) => void;
}

export function OwnerFormModal({
  ownerForm,
  saving,
  onClose,
  onSave,
  onUpdateOwnerForm,
}: OwnerFormModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={ownerForm !== null}
      onClose={onClose}
      title={ownerForm?.originalValue ? t("models_page.edit_owner") : t("models_page.add_owner")}
      description={t("models_page.owner_form_desc")}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("models_page.cancel")}
          </Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? t("models_page.saving") : t("models_page.save")}
          </Button>
        </>
      }
    >
      {ownerForm ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="owner-preset-value"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
              >
                {t("models_page.owner_value")}
              </label>
              <TextInput
                id="owner-preset-value"
                value={ownerForm.value}
                onChange={(event) => onUpdateOwnerForm({ value: event.target.value })}
                placeholder="openai"
              />
            </div>
            <div>
              <label
                htmlFor="owner-preset-label"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
              >
                {t("models_page.owner_label")}
              </label>
              <TextInput
                id="owner-preset-label"
                value={ownerForm.label}
                onChange={(event) => onUpdateOwnerForm({ label: event.target.value })}
                placeholder="OpenAI"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="owner-preset-description"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
            >
              {t("models_page.owner_description")}
            </label>
            <TextInput
              id="owner-preset-description"
              value={ownerForm.description}
              onChange={(event) => onUpdateOwnerForm({ description: event.target.value })}
              placeholder={t("models_page.owner_description_placeholder")}
            />
          </div>
          <ToggleSwitch
            checked={ownerForm.enabled}
            onCheckedChange={(enabled) => onUpdateOwnerForm({ enabled })}
            label={t("models_page.enabled")}
          />
        </div>
      ) : null}
    </Modal>
  );
}
