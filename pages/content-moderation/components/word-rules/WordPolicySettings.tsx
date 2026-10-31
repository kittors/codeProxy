import { useTranslation } from "react-i18next";
import {
  WORD_ACTIONS,
  WORD_SCAN_SCOPES,
  type WordAction,
  type WordPolicyLimits,
  type WordPolicyScope,
  type WordPolicyView,
  type WordScanScope,
} from "@code-proxy/api-client";
import { Select, SettingGroup, SettingRow, TextInput, ToggleSwitch } from "@code-proxy/ui";
import type { WordPolicyDraft } from "./wordPolicyModel";

/** Select 的「继承」项用占位值；落到草稿里就是空串 / null。 */
const INHERIT = "inherit";

interface FlagControlProps {
  /** Key 层的开关有第三态「继承」，其余层只有开 / 关。 */
  inheritable: boolean;
  value: boolean | null;
  inheritedLabel: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: boolean | null) => void;
  "aria-describedby"?: string;
}

function FlagControl({
  inheritable,
  value,
  inheritedLabel,
  ariaLabel,
  disabled,
  onChange,
  "aria-describedby": describedBy,
}: FlagControlProps) {
  const { t } = useTranslation();
  if (!inheritable) {
    return (
      <ToggleSwitch
        checked={value === true}
        disabled={disabled}
        ariaLabel={ariaLabel}
        aria-describedby={describedBy}
        onCheckedChange={onChange}
      />
    );
  }
  return (
    <Select
      value={value === null ? INHERIT : value ? "on" : "off"}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      options={[
        { value: INHERIT, label: inheritedLabel },
        { value: "on", label: t("content_moderation.words.on") },
        { value: "off", label: t("content_moderation.words.off") },
      ]}
      onChange={(next) => onChange(next === INHERIT ? null : next === "on")}
    />
  );
}

export interface WordPolicySettingsProps {
  scope: WordPolicyScope;
  draft: WordPolicyDraft;
  /** 服务端给的生效值：空设置（继承）最终落到哪里，在「继承」项上显示出来。 */
  view: WordPolicyView;
  limits: WordPolicyLimits;
  readOnly: boolean;
  onChange: (patch: Partial<WordPolicyDraft>) => void;
}

/**
 * 一份敏感词策略的设置：启用、命中后怎么处理、检查哪些文本、是否过滤回复。
 *
 * 平台和租户层的设置都是具体的值（空设置在载入时已换成生效值，所见即保存后的行为）；
 * Key 层的每一项可以选「继承」，并把继承到的值写在选项上，免得用户猜「继承」是什么。
 */
export function WordPolicySettings({
  scope,
  draft,
  view,
  limits,
  readOnly,
  onChange,
}: WordPolicySettingsProps) {
  const { t } = useTranslation();
  const isKey = scope === "key";
  const effective = view.effective;
  const onOff = (value: boolean) =>
    value ? t("content_moderation.words.on") : t("content_moderation.words.off");
  const inherit = (value: string) => t("content_moderation.words.inherit_value", { value });
  const actionLabel = (value: WordAction) => t(`content_moderation.words.action_${value}`);
  const scanLabel = (value: WordScanScope) => t(`content_moderation.words.scan_${value}`);

  // 替换文本和拦截提示只在对应的处理方式下有意义，其余时候收起来，免得设置里堆着用不上的输入框。
  const resolvedAction = draft.action || effective.action;

  return (
    <SettingGroup>
      <SettingRow
        label={t("content_moderation.words.setting_enabled")}
        description={t(`content_moderation.words.setting_enabled_hint_${scope}`)}
        controlWidth="auto"
        control={
          <ToggleSwitch
            checked={draft.enabled}
            disabled={readOnly}
            ariaLabel={t("content_moderation.words.setting_enabled")}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        }
      />

      <SettingRow
        label={t("content_moderation.words.setting_action")}
        description={t("content_moderation.words.setting_action_hint")}
        controlWidth="lg"
        control={
          <Select
            value={draft.action === "" ? INHERIT : draft.action}
            disabled={readOnly}
            aria-label={t("content_moderation.words.setting_action")}
            options={[
              ...(isKey ? [{ value: INHERIT, label: inherit(actionLabel(effective.action)) }] : []),
              ...WORD_ACTIONS.map((value) => ({ value: value as string, label: actionLabel(value) })),
            ]}
            onChange={(next) => onChange({ action: next === INHERIT ? "" : (next as WordAction) })}
          />
        }
      />

      {resolvedAction === "replace" ? (
        <SettingRow
          label={t("content_moderation.words.setting_replacement")}
          description={t("content_moderation.words.setting_replacement_hint")}
          controlWidth="lg"
          control={
            <TextInput
              value={draft.replacement}
              disabled={readOnly}
              maxLength={limits.max_replacement_chars}
              placeholder={effective.replacement}
              aria-label={t("content_moderation.words.setting_replacement")}
              onChange={(event) => onChange({ replacement: event.currentTarget.value })}
            />
          }
        />
      ) : null}

      {resolvedAction === "block" ? (
        <SettingRow
          label={t("content_moderation.words.setting_block_message")}
          description={t("content_moderation.words.setting_block_message_hint")}
          controlWidth="lg"
          control={
            <TextInput
              value={draft.blockMessage}
              disabled={readOnly}
              maxLength={limits.max_block_message_chars}
              placeholder={effective.block_message}
              aria-label={t("content_moderation.words.setting_block_message")}
              onChange={(event) => onChange({ blockMessage: event.currentTarget.value })}
            />
          }
        />
      ) : null}

      <SettingRow
        label={t("content_moderation.words.setting_scan_scope")}
        description={t("content_moderation.words.setting_scan_scope_hint")}
        controlWidth="lg"
        control={
          <Select
            value={draft.scanScope === "" ? INHERIT : draft.scanScope}
            disabled={readOnly}
            aria-label={t("content_moderation.words.setting_scan_scope")}
            options={[
              ...(isKey
                ? [{ value: INHERIT, label: inherit(scanLabel(effective.scan_scope)) }]
                : []),
              ...WORD_SCAN_SCOPES.map((value) => ({
                value: value as string,
                label: scanLabel(value),
              })),
            ]}
            onChange={(next) =>
              onChange({ scanScope: next === INHERIT ? "" : (next as WordScanScope) })
            }
          />
        }
      >
        <p className="text-xs leading-5 text-ink-3">
          {t(`content_moderation.words.scan_${draft.scanScope || effective.scan_scope}_hint`)}
        </p>
      </SettingRow>

      <SettingRow
        label={t("content_moderation.words.setting_reply_filter")}
        description={t("content_moderation.words.setting_reply_filter_hint")}
        controlWidth={isKey ? "lg" : "auto"}
        control={
          <FlagControl
            inheritable={isKey}
            value={draft.replyFilter}
            inheritedLabel={inherit(onOff(effective.reply_filter))}
            ariaLabel={t("content_moderation.words.setting_reply_filter")}
            disabled={readOnly}
            onChange={(replyFilter) => onChange({ replyFilter })}
          />
        }
      />

      <SettingRow
        label={t("content_moderation.words.setting_fold")}
        description={t("content_moderation.words.setting_fold_hint")}
        controlWidth={isKey ? "lg" : "auto"}
        control={
          <FlagControl
            inheritable={isKey}
            value={draft.foldTraditionalChinese}
            inheritedLabel={inherit(onOff(effective.fold_traditional_chinese))}
            ariaLabel={t("content_moderation.words.setting_fold")}
            disabled={readOnly}
            onChange={(foldTraditionalChinese) => onChange({ foldTraditionalChinese })}
          />
        }
      />

      {isKey ? (
        <SettingRow
          label={t("content_moderation.words.setting_inherit_tenant")}
          description={t("content_moderation.words.setting_inherit_tenant_hint")}
          controlWidth="auto"
          control={
            <ToggleSwitch
              checked={draft.inheritTenant}
              disabled={readOnly}
              ariaLabel={t("content_moderation.words.setting_inherit_tenant")}
              onCheckedChange={(inheritTenant) => onChange({ inheritTenant })}
            />
          }
        />
      ) : null}
    </SettingGroup>
  );
}
