import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Gauge, MessageSquareText, Route, ShieldCheck, SlidersHorizontal, Tag } from "lucide-react";
import { RestrictionMultiSelect } from "@features/api-key-restrictions";
import { PeriodSpendingFields, RequestLimitFields, requestLimitRules } from "@features/period-spending";
import {
  Button,
  FormField,
  FormSection,
  Modal,
  SettingGroup,
  SettingRow,
  TextInput,
  Textarea,
  ToggleSwitch,
  rules,
  useFormValidation,
  type MultiSelectOption,
} from "@code-proxy/ui";
import type { ProfileDraft } from "./profileDraft";

const FORM_ID = "permission-profile-form";

/**
 * 新增 / 编辑账户权限模板。
 *
 * 十几个字段按用户的思路分五段：先给模板起名 → 能用哪些渠道和模型 → 花多少钱 →
 * 请求次数与速率 → 系统提示词这类高级项。以前前半段有分组、后半段（渠道 / 模型 /
 * 提示词）是一串没有标题的输入框。名称在字段下就地校验（以前只弹 toast）；
 * 含多行文本，所以除了回车提交还支持 ⌘ / Ctrl + Enter。
 */
export function PermissionProfileFormModal({
  open,
  draft,
  setDraft,
  saving,
  availableChannelGroups,
  availableChannels,
  availableModels,
  onSubmit,
  onClose,
}: {
  open: boolean;
  draft: ProfileDraft;
  setDraft: Dispatch<SetStateAction<ProfileDraft>>;
  saving: boolean;
  availableChannelGroups: MultiSelectOption[];
  /** 已按所选渠道分组过滤过的渠道。 */
  availableChannels: MultiSelectOption[];
  availableModels: MultiSelectOption[];
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const validation = useFormValidation(draft, {
    name: [rules.required()],
    ...requestLimitRules,
  });
  const { reset } = validation;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSubmit();
  };

  const restrictionLabels = {
    selectFilteredLabel: t("api_keys_page.select_filtered"),
    clearRestrictionLabel: t("api_keys_page.clear_restriction"),
    noResultsLabel: t("api_keys_page.no_results"),
  };

  return (
    <Modal
      open={open}
      title={
        draft.id
          ? t("api_key_permissions_page.edit_config")
          : t("api_key_permissions_page.create_config")
      }
      description={t("api_key_permissions_page.config_modal_desc")}
      icon={<ShieldCheck />}
      size="lg"
      onClose={onClose}
      onSubmitShortcut={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {t("api_key_permissions_page.save_config")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FormSection title={t("api_key_permissions_page.basics_section")} icon={<Tag />}>
          <FormField
            label={t("api_key_permissions_page.form_name")}
            required
            description={t("api_key_permissions_page.form_name_hint")}
            error={validation.error("name")}
          >
            <TextInput
              value={draft.name}
              aria-label={t("api_key_permissions_page.form_name")}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("api_key_permissions_page.form_name_placeholder")}
              {...validation.bind("name")}
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("api_key_permissions_page.access_section")}
          description={t("api_key_permissions_page.access_section_desc")}
          icon={<Route />}
        >
          <FormField label={t("api_keys_page.form_allowed_channel_groups")} reserveMeta={false}>
            <RestrictionMultiSelect
              options={availableChannelGroups}
              value={draft.allowedChannelGroups}
              onChange={(selected) =>
                setDraft((prev) => ({ ...prev, allowedChannelGroups: selected }))
              }
              placeholder={t("api_keys_page.select_channel_groups")}
              unrestrictedLabel={t("api_keys_page.form_all_channel_groups")}
              selectedCountLabel={(count) =>
                t("api_keys_page.selected_channel_groups_count", { count })
              }
              searchPlaceholder={t("api_keys_page.search_channel_groups")}
              {...restrictionLabels}
            />
          </FormField>
          <SettingGroup flat>
            <SettingRow
              label={t("api_keys_page.form_exact_channels")}
              description={t("api_keys_page.form_exact_channels_desc")}
              controlWidth="auto"
              control={
                <ToggleSwitch
                  checked={draft.useExactChannelRestrictions}
                  ariaLabel={t("api_keys_page.form_exact_channels")}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({
                      ...prev,
                      useExactChannelRestrictions: checked,
                      allowedChannels: checked ? prev.allowedChannels : [],
                    }))
                  }
                />
              }
            />
          </SettingGroup>
          {draft.useExactChannelRestrictions ? (
            <FormField label={t("api_keys_page.form_allowed_channels")} reserveMeta={false}>
              <RestrictionMultiSelect
                options={availableChannels}
                value={draft.allowedChannels}
                onChange={(selected) => setDraft((prev) => ({ ...prev, allowedChannels: selected }))}
                placeholder={t("api_keys_page.select_channels")}
                unrestrictedLabel={t("api_keys_page.form_all_channels")}
                selectedCountLabel={(count) => t("api_keys_page.selected_channels_count", { count })}
                searchPlaceholder={t("api_keys_page.search_channels")}
                {...restrictionLabels}
              />
            </FormField>
          ) : null}
          <FormField label={t("api_keys_page.form_allowed_models")} reserveMeta={false}>
            <RestrictionMultiSelect
              options={availableModels}
              value={draft.allowedModels}
              onChange={(selected) => setDraft((prev) => ({ ...prev, allowedModels: selected }))}
              placeholder={t("api_keys_page.select_models")}
              unrestrictedLabel={t("api_keys_page.form_all_models")}
              selectedCountLabel={(count) => t("api_keys_page.selected_models_count", { count })}
              searchPlaceholder={t("api_keys_page.search_models")}
              {...restrictionLabels}
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("api_key_permissions_page.quota_section")}
          description={`${t("api_key_permissions_page.quota_section_desc")} ${t("quota.fields_hint")}`}
          icon={<Gauge />}
        >
          <PeriodSpendingFields
            t={t}
            value={draft.periodSpending}
            onChange={(periodSpending) => setDraft((prev) => ({ ...prev, periodSpending }))}
            idPrefix="permission-profile-period"
          />
        </FormSection>

        <FormSection
          title={t("api_key_permissions_page.request_realtime_section")}
          description={t("api_key_permissions_page.request_realtime_section_desc")}
          icon={<SlidersHorizontal />}
        >
          <RequestLimitFields
            value={draft}
            onChange={(field, raw) => setDraft((prev) => ({ ...prev, [field]: raw }))}
            labels={{
              dailyLimit: t("api_key_permissions_page.form_daily_limit"),
              totalQuota: t("api_key_permissions_page.form_total_quota"),
              concurrencyLimit: t("api_key_permissions_page.form_concurrency_limit"),
              rpmLimit: t("api_key_permissions_page.form_rpm_limit"),
              tpmLimit: t("api_key_permissions_page.form_tpm_limit"),
            }}
            placeholder={t("api_key_permissions_page.form_unlimited_hint")}
            errors={{
              dailyLimit: validation.error("dailyLimit"),
              totalQuota: validation.error("totalQuota"),
              concurrencyLimit: validation.error("concurrencyLimit"),
              rpmLimit: validation.error("rpmLimit"),
              tpmLimit: validation.error("tpmLimit"),
            }}
            onFieldBlur={validation.touch}
          />
        </FormSection>

        <FormSection
          title={t("api_key_permissions_page.advanced_section")}
          icon={<MessageSquareText />}
        >
          <FormField
            label={t("api_key_permissions_page.form_system_prompt")}
            optional
            description={t("api_key_permissions_page.system_prompt_hint")}
          >
            <Textarea
              value={draft.systemPrompt}
              // 标签里带「可选」字样，显式给名称，读屏和测试拿到的都是纯字段名。
              aria-label={t("api_key_permissions_page.form_system_prompt")}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, systemPrompt: event.target.value }))
              }
              placeholder={t("api_key_permissions_page.system_prompt_placeholder")}
              rows={3}
            />
          </FormField>
        </FormSection>
      </form>
    </Modal>
  );
}
