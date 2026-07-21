import { RefreshCw } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Select, type SelectOption } from "@code-proxy/ui";
import type { ApiKeyFormValues } from "../types";

export function ApiKeyFormFields({
  t,
  form,
  setForm,
  editMode,
  permissionProfileOptions,
  regenerateKey,
  serverGeneratesKey = false,
  hidePermissionProfile = false,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  form: ApiKeyFormValues;
  setForm: React.Dispatch<React.SetStateAction<ApiKeyFormValues>>;
  editMode: boolean;
  permissionProfileOptions: SelectOption[];
  regenerateKey: () => void;
  /** When true (user-scoped create), key is generated server-side after submit. */
  serverGeneratesKey?: boolean;
  /** Owned keys inherit account quota; do not attach a per-key profile. */
  hidePermissionProfile?: boolean;
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

      {serverGeneratesKey ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-white/60">
          {editMode
            ? t("end_users.key_rotate_only", {
                defaultValue: "密钥值不能直接编辑。需要更换凭证时，请使用独立的“轮换密钥”操作。",
              })
            : t("end_users.key_server_generated", {
                defaultValue:
                  "创建后由服务端生成唯一 API Key，并仅展示一次（将尝试复制到剪贴板）。",
              })}
        </p>
      ) : (
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
            />
            <Button variant="secondary" size="sm" onClick={regenerateKey}>
              <RefreshCw size={14} />
              {editMode ? t("api_keys_page.form_refresh_key") : t("api_keys_page.form_regenerate")}
            </Button>
          </div>
        </div>
      )}

      {hidePermissionProfile ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          {t("end_users.key_quota_on_account", {
            defaultValue: "限额与权限在用户账号上配置，本密钥与账号下其它密钥共用同一额度池。",
          })}
        </p>
      ) : (
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
      )}
    </div>
  );
}
