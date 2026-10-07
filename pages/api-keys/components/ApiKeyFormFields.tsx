import { RefreshCw } from "lucide-react";
import { Button, Callout, FormField, Select, TextInput, type SelectOption } from "@code-proxy/ui";
import type { ApiKeyFormValues } from "../types";

export type ApiKeyFormField = "name" | "key";

/**
 * 管理员维护的 API Key 表单字段：名称、Key 值、权限配置。
 *
 * 编辑时 Key 值可以直接改（例如恢复一把下游已在用的旧 Key），但改了之后旧值立刻失效——
 * 只要输入框里的值和原值不同，就在下面挂一条琥珀提示，把后果说在保存之前。
 */
export function ApiKeyFormFields({
  t,
  form,
  setForm,
  editMode,
  originalKey,
  permissionProfileOptions,
  regenerateKey,
  errors,
  onFieldBlur,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  form: ApiKeyFormValues;
  setForm: React.Dispatch<React.SetStateAction<ApiKeyFormValues>>;
  editMode: boolean;
  /** 编辑前的 Key 值，用来判断这次保存会不会让旧 Key 失效。 */
  originalKey?: string;
  permissionProfileOptions: SelectOption[];
  regenerateKey: () => void;
  errors: Partial<Record<ApiKeyFormField, string>>;
  onFieldBlur: (field: ApiKeyFormField) => void;
}) {
  const keyChanged =
    editMode && originalKey !== undefined && form.key.trim() !== originalKey.trim();
  const regenerateLabel = editMode
    ? t("api_keys_page.form_refresh_key")
    : t("api_keys_page.form_regenerate");

  return (
    <>
      <FormField
        label={t("api_keys_page.form_name_label")}
        required
        description={t("api_keys_page.form_name_hint")}
        error={errors.name}
      >
        <TextInput
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          onBlur={() => onFieldBlur("name")}
          placeholder={t("api_keys_page.form_name_placeholder")}
          aria-label={t("api_keys_page.form_name_label")}
        />
      </FormField>

      <FormField
        label={t("api_keys_page.form_key_label")}
        required
        description={
          editMode ? t("api_keys_page.form_key_edit_hint") : t("api_keys_page.form_key_hint")
        }
        error={errors.key}
      >
        <TextInput
          value={form.key}
          onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
          onBlur={() => onFieldBlur("key")}
          placeholder={t("api_keys_page.form_key_placeholder")}
          aria-label={t("api_keys_page.form_key_label")}
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
          endAdornment={
            <Button
              variant="ghost"
              size="xs"
              onClick={regenerateKey}
              aria-label={regenerateLabel}
              tooltip={regenerateLabel}
            >
              <RefreshCw size={14} />
            </Button>
          }
        />
      </FormField>

      {keyChanged ? (
        <Callout tone="warning">{t("api_keys_page.key_change_warning")}</Callout>
      ) : null}

      <FormField
        label={t("api_keys_page.form_permission_profile")}
        description={t("api_keys_page.form_permission_profile_desc")}
        reserveMeta={false}
      >
        <Select
          value={form.permissionProfileId}
          onChange={(value) => setForm((prev) => ({ ...prev, permissionProfileId: value }))}
          options={permissionProfileOptions}
          aria-label={t("api_keys_page.form_permission_profile")}
          placeholder={t("api_keys_page.form_permission_profile_placeholder")}
        />
      </FormField>
    </>
  );
}
