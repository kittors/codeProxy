import { RefreshCw } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { Select, type SelectOption } from "@/modules/ui/Select";
import type { ApiKeyFormValues } from "@/modules/api-keys/types";

export function ApiKeyFormFields({
  t,
  form,
  setForm,
  editMode,
  permissionProfileOptions,
  regenerateKey,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  form: ApiKeyFormValues;
  setForm: React.Dispatch<React.SetStateAction<ApiKeyFormValues>>;
  editMode: boolean;
  permissionProfileOptions: SelectOption[];
  regenerateKey: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
          {t("api_keys_page.form_name_label")} <span className="text-rose-500">*</span>
        </label>
        <TextInput
          type="text"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t("api_keys_page.form_name_placeholder")}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
          {t("api_keys_page.form_key_label")}
        </label>
        <div className="flex gap-2">
          <TextInput
            type="text"
            value={form.key}
            onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
            placeholder={t("api_keys_page.form_key_placeholder")}
            className="flex-1 font-mono"
            readOnly
          />
          <Button variant="secondary" size="sm" onClick={regenerateKey}>
            <RefreshCw size={14} />
            {editMode ? t("api_keys_page.form_refresh_key") : t("api_keys_page.form_regenerate")}
          </Button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
          {t("api_keys_page.form_permission_profile")}
        </label>
        <Select
          value={form.permissionProfileId}
          onChange={(value) => setForm((prev) => ({ ...prev, permissionProfileId: value }))}
          options={permissionProfileOptions}
          aria-label={t("api_keys_page.form_permission_profile")}
          placeholder={t("api_keys_page.form_permission_profile_placeholder")}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-white/40">
          {t("api_keys_page.form_permission_profile_desc")}
        </p>
      </div>
    </div>
  );
}
