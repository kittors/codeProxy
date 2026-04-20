import { Info, RefreshCw } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { RestrictionMultiSelect } from "@/modules/api-keys/RestrictionMultiSelect";
import type { MultiSelectOption } from "@/modules/ui/MultiSelect";
import type { ApiKeyFormValues } from "@/modules/api-keys/types";

export function ApiKeyFormFields({
  t,
  form,
  setForm,
  availableChannels,
  availableChannelGroups,
  availableModels,
  editMode,
  regenerateKey,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  form: ApiKeyFormValues;
  setForm: React.Dispatch<React.SetStateAction<ApiKeyFormValues>>;
  availableChannels: MultiSelectOption[];
  availableChannelGroups: MultiSelectOption[];
  availableModels: MultiSelectOption[];
  editMode: boolean;
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("api_keys_page.form_daily_limit")}
          </label>
          <TextInput
            type="number"
            value={form.dailyLimit}
            onChange={(e) => setForm((prev) => ({ ...prev, dailyLimit: e.target.value }))}
            placeholder={t("api_keys_page.form_unlimited_hint")}
            min={0}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("api_keys_page.form_total_quota")}
          </label>
          <TextInput
            type="number"
            value={form.totalQuota}
            onChange={(e) => setForm((prev) => ({ ...prev, totalQuota: e.target.value }))}
            placeholder={t("api_keys_page.form_unlimited_hint")}
            min={0}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("api_keys_page.form_concurrency_limit")}
          </label>
          <TextInput
            type="number"
            value={form.concurrencyLimit}
            onChange={(e) => setForm((prev) => ({ ...prev, concurrencyLimit: e.target.value }))}
            placeholder={t("api_keys_page.form_unlimited_hint")}
            min={0}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <HoverTooltip
            content={t("api_keys.rpm_full")}
            className="mb-1 inline-flex items-center gap-1"
          >
            <label className="text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_keys_page.form_rpm_limit")}
            </label>
            <Info size={14} className="text-slate-400 dark:text-white/40" />
          </HoverTooltip>
          <TextInput
            type="number"
            value={form.rpmLimit}
            onChange={(e) => setForm((prev) => ({ ...prev, rpmLimit: e.target.value }))}
            placeholder={t("api_keys_page.form_unlimited_hint")}
            min={0}
          />
        </div>
        <div>
          <HoverTooltip
            content={t("api_keys.tpm_full")}
            className="mb-1 inline-flex items-center gap-1"
          >
            <label className="text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_keys_page.form_tpm_limit")}
            </label>
            <Info size={14} className="text-slate-400 dark:text-white/40" />
          </HoverTooltip>
          <TextInput
            type="number"
            value={form.tpmLimit}
            onChange={(e) => setForm((prev) => ({ ...prev, tpmLimit: e.target.value }))}
            placeholder={t("api_keys_page.form_unlimited_hint")}
            min={0}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
          {t("api_keys_page.form_allowed_channel_groups")}
        </label>
        <RestrictionMultiSelect
          options={availableChannelGroups}
          value={form.allowedChannelGroups}
          onChange={(selected) =>
            setForm((prev) => ({
              ...prev,
              allowedChannelGroups: selected,
            }))
          }
          placeholder={t("api_keys_page.select_channel_groups")}
          unrestrictedLabel={t("api_keys_page.form_all_channel_groups")}
          selectedCountLabel={(count) =>
            t("api_keys_page.selected_channel_groups_count", { count })
          }
          searchPlaceholder={t("api_keys_page.search_channel_groups")}
          selectFilteredLabel={t("api_keys_page.select_filtered")}
          clearRestrictionLabel={t("api_keys_page.clear_restriction")}
          noResultsLabel={t("api_keys_page.no_results")}
        />
      </div>

      <div>
        <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800 dark:text-white/85">
              {t("api_keys_page.form_exact_channels")}
            </div>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-100/75">
              {t("api_keys_page.form_exact_channels_desc")}
            </p>
          </div>
          <ToggleSwitch
            checked={form.useExactChannelRestrictions}
            ariaLabel={t("api_keys_page.form_exact_channels")}
            onCheckedChange={(checked) =>
              setForm((prev) => ({
                ...prev,
                useExactChannelRestrictions: checked,
                allowedChannels: checked ? prev.allowedChannels : [],
              }))
            }
          />
        </div>
        {form.useExactChannelRestrictions ? (
          <>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_keys_page.form_allowed_channels")}
            </label>
            <RestrictionMultiSelect
              options={availableChannels}
              value={form.allowedChannels}
              onChange={(selected) => setForm((prev) => ({ ...prev, allowedChannels: selected }))}
              placeholder={t("api_keys_page.select_channels")}
              unrestrictedLabel={t("api_keys_page.form_all_channels")}
              selectedCountLabel={(count) => t("api_keys_page.selected_channels_count", { count })}
              searchPlaceholder={t("api_keys_page.search_channels")}
              selectFilteredLabel={t("api_keys_page.select_filtered")}
              clearRestrictionLabel={t("api_keys_page.clear_restriction")}
              noResultsLabel={t("api_keys_page.no_results")}
            />
            {form.allowedChannelGroups.length > 0 ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                {t("api_keys_page.form_exact_channels_intersection_warning")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
          {t("api_keys_page.form_allowed_models")}
        </label>
        <RestrictionMultiSelect
          options={availableModels}
          value={form.allowedModels}
          onChange={(selected) => setForm((prev) => ({ ...prev, allowedModels: selected }))}
          placeholder={t("api_keys_page.select_models")}
          unrestrictedLabel={t("api_keys_page.form_all_models")}
          selectedCountLabel={(count) => t("api_keys_page.selected_models_count", { count })}
          searchPlaceholder={t("api_keys_page.search_models")}
          selectFilteredLabel={t("api_keys_page.select_filtered")}
          clearRestrictionLabel={t("api_keys_page.clear_restriction")}
          noResultsLabel={t("api_keys_page.no_results")}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
          {t("api_keys_page.form_system_prompt")}
        </label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
          placeholder={t("api_keys_page.system_prompt_hint")}
          rows={3}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-white/40">
          {t("api_keys_page.form_system_prompt_desc")}
        </p>
      </div>
    </div>
  );
}
