import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import {
  FormField,
  SettingGroup,
  SettingRow,
  ToggleSwitch,
  type MultiSelectOption,
} from "@code-proxy/ui";
import { RestrictionMultiSelect } from "./RestrictionMultiSelect";

export interface AccessScopeValue {
  allowedChannelGroups: string[];
  allowedChannels: string[];
  /** 是否在渠道分组之外再精确指定渠道（高级）。 */
  useExactChannels: boolean;
  allowedModels: string[];
}

function ReadOnlyList({ items, unrestricted }: { items: string[]; unrestricted: string }) {
  if (items.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-300">
        <Check size={12} aria-hidden="true" className="text-ink-3 colorful:text-current" />
        {unrestricted}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex max-w-full items-center truncate rounded-full bg-ink/[0.05] px-2 py-0.5 font-mono text-xs text-ink-2 dark:bg-white/[0.07]"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/**
 * 访问范围：能走哪些渠道分组 / 渠道、能用哪些模型。账号编辑与权限模板共用这一组字段，
 * 空表示不限制。只读（账号绑定了模板）时显示为标签列表。
 */
export function AccessScopeFields({
  value,
  onChange,
  readOnly = false,
  availableChannelGroups,
  availableChannels,
  availableModels,
}: {
  value: AccessScopeValue;
  onChange?: (next: AccessScopeValue) => void;
  readOnly?: boolean;
  availableChannelGroups: MultiSelectOption[];
  /** 已按所选渠道分组过滤过的渠道。 */
  availableChannels: MultiSelectOption[];
  availableModels: MultiSelectOption[];
}) {
  const { t } = useTranslation();
  const labels = {
    selectFilteredLabel: t("api_keys_page.select_filtered"),
    clearRestrictionLabel: t("api_keys_page.clear_restriction"),
    noResultsLabel: t("api_keys_page.no_results"),
  };
  const set = (patch: Partial<AccessScopeValue>) => onChange?.({ ...value, ...patch });

  if (readOnly || !onChange) {
    return (
      <dl className="space-y-4">
        <div>
          <dt className="mb-1.5 text-xs font-medium text-ink-2">{t("api_keys_page.form_allowed_channel_groups")}</dt>
          <dd>
            <ReadOnlyList items={value.allowedChannelGroups} unrestricted={t("api_keys_page.form_all_channel_groups")} />
          </dd>
        </div>
        {value.allowedChannels.length > 0 ? (
          <div>
            <dt className="mb-1.5 text-xs font-medium text-ink-2">{t("api_keys_page.form_allowed_channels")}</dt>
            <dd>
              <ReadOnlyList items={value.allowedChannels} unrestricted={t("api_keys_page.form_all_channels")} />
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="mb-1.5 text-xs font-medium text-ink-2">{t("api_keys_page.form_allowed_models")}</dt>
          <dd>
            <ReadOnlyList items={value.allowedModels} unrestricted={t("api_keys_page.form_all_models")} />
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-4">
      <FormField label={t("api_keys_page.form_allowed_channel_groups")} reserveMeta={false}>
        <RestrictionMultiSelect
          options={availableChannelGroups}
          value={value.allowedChannelGroups}
          onChange={(selected) => set({ allowedChannelGroups: selected })}
          placeholder={t("api_keys_page.select_channel_groups")}
          unrestrictedLabel={t("api_keys_page.form_all_channel_groups")}
          selectedCountLabel={(count) => t("api_keys_page.selected_channel_groups_count", { count })}
          searchPlaceholder={t("api_keys_page.search_channel_groups")}
          {...labels}
        />
      </FormField>
      <SettingGroup flat>
        <SettingRow
          label={t("api_keys_page.form_exact_channels")}
          description={t("api_keys_page.form_exact_channels_desc")}
          controlWidth="auto"
          control={
            <ToggleSwitch
              checked={value.useExactChannels}
              ariaLabel={t("api_keys_page.form_exact_channels")}
              onCheckedChange={(checked) =>
                set({ useExactChannels: checked, allowedChannels: checked ? value.allowedChannels : [] })
              }
            />
          }
        />
      </SettingGroup>
      {value.useExactChannels ? (
        <FormField label={t("api_keys_page.form_allowed_channels")} reserveMeta={false}>
          <RestrictionMultiSelect
            options={availableChannels}
            value={value.allowedChannels}
            onChange={(selected) => set({ allowedChannels: selected })}
            placeholder={t("api_keys_page.select_channels")}
            unrestrictedLabel={t("api_keys_page.form_all_channels")}
            selectedCountLabel={(count) => t("api_keys_page.selected_channels_count", { count })}
            searchPlaceholder={t("api_keys_page.search_channels")}
            {...labels}
          />
        </FormField>
      ) : null}
      <FormField
        label={t("api_keys_page.form_allowed_models")}
        description={t("access_policy.allowed_models_hint")}
        reserveMeta={false}
      >
        <RestrictionMultiSelect
          options={availableModels}
          value={value.allowedModels}
          onChange={(selected) => set({ allowedModels: selected })}
          placeholder={t("api_keys_page.select_models")}
          unrestrictedLabel={t("api_keys_page.form_all_models")}
          selectedCountLabel={(count) => t("api_keys_page.selected_models_count", { count })}
          searchPlaceholder={t("api_keys_page.search_models")}
          {...labels}
        />
      </FormField>
    </div>
  );
}
