import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { WORD_SCAN_SCOPES, type WordPolicyView, type WordScanScope } from "@code-proxy/api-client";
import { Select, SettingGroup, SettingRow, ToggleSwitch } from "@code-proxy/ui";
import type { WordPolicyDraft } from "./wordPolicyModel";

/** Select 的「继承」项用占位值；落到草稿里就是空串 / null。 */
const INHERIT = "inherit";

interface FlagControlProps {
  /** Key 层的开关有第三态「继承」，其余层只有开 / 关。 */
  inheritable: boolean;
  value: boolean | null;
  /** 没有「继承」选项的层里，空值（继承）按这个生效值显示；它不会写进草稿。 */
  effectiveValue: boolean;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: boolean | null) => void;
}

function FlagControl({ inheritable, value, effectiveValue, ariaLabel, disabled, onChange }: FlagControlProps) {
  const { t } = useTranslation();
  if (!inheritable) {
    return (
      <ToggleSwitch
        checked={value ?? effectiveValue}
        disabled={disabled}
        ariaLabel={ariaLabel}
        onCheckedChange={onChange}
      />
    );
  }
  const onOff = (on: boolean) => (on ? t("content_moderation.words.on") : t("content_moderation.words.off"));
  return (
    <Select
      value={value === null ? INHERIT : value ? "on" : "off"}
      disabled={disabled}
      aria-label={ariaLabel}
      options={[
        { value: INHERIT, label: t("content_moderation.words.inherit_value", { value: onOff(effectiveValue) }) },
        { value: "on", label: onOff(true) },
        { value: "off", label: onOff(false) },
      ]}
      onChange={(next) => onChange(next === INHERIT ? null : next === "on")}
    />
  );
}

export interface WordAdvancedSettingsProps {
  draft: WordPolicyDraft;
  view: WordPolicyView;
  /** Key 层：每一项都能「继承」租户的设置，另有「同时应用租户的规则」。 */
  keyScope: boolean;
  readOnly: boolean;
  /**
   * 已保存的、启用的、匹配长度不限的正则有几条（服务端数的）。开了回复过滤时，流式回复里
   * 跨两个流事件的匹配拦不住，要在回复过滤旁边说清楚。
   */
  unboundedRegex: number;
  onChange: (patch: Partial<WordPolicyDraft>) => void;
}

/**
 * 不常改的设置收在「高级选项」里：检查哪些文本、是否过滤回复、繁简体，以及 Key 层是否叠加租户规则。
 * 默认值已经适合大多数场景，展开前在标题旁概括当前的取值，不展开也知道现在是什么。
 */
export function WordAdvancedSettings({
  draft,
  view,
  keyScope,
  readOnly,
  unboundedRegex,
  onChange,
}: WordAdvancedSettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const effective = view.effective;
  const scanScope = draft.scanScope || effective.scan_scope;
  const replyFilterOn = draft.replyFilter ?? effective.reply_filter;
  const foldOn = draft.foldTraditionalChinese ?? effective.fold_traditional_chinese;
  const scanLabel = (value: WordScanScope) => t(`content_moderation.words.scan_${value}`);
  const summary = [
    scanLabel(scanScope),
    replyFilterOn ? t("content_moderation.words.summary_reply_on") : null,
    foldOn ? t("content_moderation.words.summary_fold_on") : null,
    keyScope && !draft.inheritTenant ? t("content_moderation.words.summary_own_rules_only") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-sm font-semibold text-ink transition hover:text-accent-ink"
      >
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={["shrink-0 text-ink-3 transition-transform", open ? "" : "-rotate-90"].join(" ")}
        />
        {t("content_moderation.words.advanced_title")}
        <span className="min-w-0 truncate text-xs font-normal text-ink-3">{summary}</span>
      </button>

      {/* 收起时也要看得到：这是会漏过敏感词的情形，不能藏在折叠里。 */}
      {replyFilterOn && unboundedRegex > 0 ? (
        <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
          {t("content_moderation.words.reply_unbounded_warning", { count: unboundedRegex })}
        </p>
      ) : null}

      {open ? (
        <div id={panelId}>
          <SettingGroup>
            <SettingRow
              label={t("content_moderation.words.setting_scan_scope")}
              description={t(`content_moderation.words.scan_${scanScope}_hint`)}
              controlWidth="lg"
              control={
                <Select
                  value={draft.scanScope === "" ? (keyScope ? INHERIT : effective.scan_scope) : draft.scanScope}
                  disabled={readOnly}
                  aria-label={t("content_moderation.words.setting_scan_scope")}
                  options={[
                    ...(keyScope
                      ? [
                          {
                            value: INHERIT,
                            label: t("content_moderation.words.inherit_value", {
                              value: scanLabel(effective.scan_scope),
                            }),
                          },
                        ]
                      : []),
                    ...WORD_SCAN_SCOPES.map((value) => ({ value: value as string, label: scanLabel(value) })),
                  ]}
                  onChange={(next) => onChange({ scanScope: next === INHERIT ? "" : (next as WordScanScope) })}
                />
              }
            />

            <SettingRow
              label={t("content_moderation.words.setting_reply_filter")}
              description={t("content_moderation.words.setting_reply_filter_hint")}
              controlWidth={keyScope ? "lg" : "auto"}
              control={
                <FlagControl
                  inheritable={keyScope}
                  value={draft.replyFilter}
                  effectiveValue={effective.reply_filter}
                  ariaLabel={t("content_moderation.words.setting_reply_filter")}
                  disabled={readOnly}
                  onChange={(replyFilter) => onChange({ replyFilter })}
                />
              }
            />

            <SettingRow
              label={t("content_moderation.words.setting_fold")}
              description={t("content_moderation.words.setting_fold_hint")}
              controlWidth={keyScope ? "lg" : "auto"}
              control={
                <FlagControl
                  inheritable={keyScope}
                  value={draft.foldTraditionalChinese}
                  effectiveValue={effective.fold_traditional_chinese}
                  ariaLabel={t("content_moderation.words.setting_fold")}
                  disabled={readOnly}
                  onChange={(foldTraditionalChinese) => onChange({ foldTraditionalChinese })}
                />
              }
            />

            {keyScope ? (
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
        </div>
      ) : null}
    </section>
  );
}
