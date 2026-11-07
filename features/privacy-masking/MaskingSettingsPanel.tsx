import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Plus, Save, Trash2, Undo2 } from "lucide-react";
import {
  Button,
  Callout,
  SegmentedControl,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";
import type { MaskKindAction, MaskRule, PrivacyMaskPolicy, PrivacyMaskSettings } from "@code-proxy/api-client";
import { KindDot, useKindLabel } from "./KindChip";
import {
  ACTION_PERSONAL_KINDS as PERSONAL_KINDS,
  ACTION_SECRET_KINDS as SECRET_KINDS,
  PERSONAL_CATEGORIES,
} from "./maskKinds";
import { MaskingTryIt } from "./MaskingTryIt";
import { WordListEditor } from "./WordListEditor";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 租户的脱敏设置。遮什么、怎么处理都由管理员在控制台决定；门户用户只在门户里看生效的规则和自己
 * 的记录，不能改（2026-11-05 起撤掉了门户自设，连同「强制开启」「门户能否自己设置」）。
 *
 * 改动先放在草稿里，页签栏右侧出现「未保存 · 放弃 · 保存」；「试一试」用的是草稿，保存前就能看到效果。
 *
 * 保存操作 portal 进工作区页签栏里的 actionsSlot，跟页签栏一起吸顶。原来是自己的一条 sticky top-0：
 * 一滚动就和同样吸在 top-0 的页签栏叠在一起、把它整个盖住，出现时还把整页内容往下推一截。
 */
export function MaskingSettingsPanel({
  settings,
  scope,
  canWrite,
  saving,
  onSave,
  actionsSlot,
}: {
  settings: PrivacyMaskSettings;
  scope: "tenant" | "portal";
  canWrite: boolean;
  saving: boolean;
  onSave: (next: PrivacyMaskSettings) => void;
  /** 页签栏里留给保存操作的位置；还没挂载时为 null，这一刻不画。 */
  actionsSlot: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const [draft, setDraft] = useState(settings);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const policy = draft.policy;
  const locked = !canWrite || saving;

  const update = (patch: Partial<PrivacyMaskPolicy>) => setDraft((d) => ({ ...d, policy: { ...d.policy, ...patch } }));
  const kindOn = (id: string, fallback: boolean) => policy.kinds[id] ?? fallback;
  const actionOf = (kind: string): MaskKindAction => policy.actions[kind] ?? "mask";
  const setAction = (kind: string, action: MaskKindAction) => {
    const next = { ...policy.actions };
    if (action === "mask") delete next[kind];
    else next[kind] = action;
    update({ actions: next });
  };

  const actionKinds = [
    ...(policy.secrets ? SECRET_KINDS : []),
    ...(policy.personal ? PERSONAL_KINDS : []),
    ...(policy.words.length > 0 ? ["TERM"] : []),
    ...policy.rules.map((r) => r.kind).filter((k, i, all) => k && all.indexOf(k) === i),
  ];

  return (
    <div className="flex flex-col gap-6">
      {dirty && actionsSlot
        ? createPortal(
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                {t("privacy_masking.settings.unsaved")}
              </span>
              {/* xs 和页签条同高（h-8）：钉住区出现保存操作时不长高，下面的内容不跳 */}
              <Button size="xs" variant="ghost" disabled={saving} onClick={() => setDraft(settings)}>
                <Undo2 size={13} aria-hidden="true" />
                {t("privacy_masking.settings.discard")}
              </Button>
              <Button size="xs" variant="primary" disabled={locked} onClick={() => onSave(draft)}>
                <Save size={13} aria-hidden="true" />
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </>,
            actionsSlot,
          )
        : null}

      {settings.server_disabled ? (
        <Callout tone="danger" role="alert">
          {t("privacy_masking.settings.server_disabled")}
        </Callout>
      ) : null}
      {!settings.persistent ? <Callout tone="warning">{t("privacy_masking.settings.not_persistent")}</Callout> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
      <div className="flex min-w-0 flex-col gap-6">
      <Section title={t("privacy_masking.settings.what_title")} description={t("privacy_masking.settings.what_desc")}>
        <SettingGroup>
          <SettingRow
            label={t("privacy_masking.settings.secrets")}
            description={t("privacy_masking.settings.secrets_desc")}
            controlWidth="auto"
            control={
              <ToggleSwitch
                checked={policy.secrets}
                disabled={locked}
                onCheckedChange={(secrets) => update({ secrets })}
                ariaLabel={t("privacy_masking.settings.secrets")}
              />
            }
          />
          <SettingRow
            label={t("privacy_masking.settings.personal")}
            description={t("privacy_masking.settings.personal_desc")}
            controlWidth="auto"
            control={
              <ToggleSwitch
                checked={policy.personal}
                disabled={locked}
                onCheckedChange={(personal) => update({ personal })}
                ariaLabel={t("privacy_masking.settings.personal")}
              />
            }
          >
            {policy.personal ? (
              <PersonalKinds kindOn={kindOn} disabled={locked} onToggle={(id, on) => update({ kinds: { ...policy.kinds, [id]: on } })} />
            ) : null}
          </SettingRow>
        </SettingGroup>
      </Section>

      <Section title={t("privacy_masking.settings.words_title")} description={t("privacy_masking.settings.words_desc")}>
        <SettingGroup>
          <div className="px-4 py-3.5">
            <WordListEditor
              values={policy.words}
              onChange={(words) => update({ words })}
              placeholder={t("privacy_masking.settings.words_placeholder")}
              label={t("privacy_masking.settings.words_title")}
              concealable
              disabled={locked}
            />
          </div>
          <SettingRow
            controlWidth="auto"
            label={t("privacy_masking.settings.any_case")}
            description={t("privacy_masking.settings.any_case_desc")}
            control={<ToggleSwitch checked={policy.words_any_case} disabled={locked} onCheckedChange={(v) => update({ words_any_case: v })} ariaLabel={t("privacy_masking.settings.any_case")} />}
          />
          <SettingRow
            controlWidth="auto"
            label={t("privacy_masking.settings.whole")}
            description={t("privacy_masking.settings.whole_desc")}
            control={<ToggleSwitch checked={policy.words_whole} disabled={locked} onCheckedChange={(v) => update({ words_whole: v })} ariaLabel={t("privacy_masking.settings.whole")} />}
          />
        </SettingGroup>
      </Section>

      <Section title={t("privacy_masking.settings.rules_title")} description={t("privacy_masking.settings.rules_desc")}>
        <SettingGroup>
          {policy.rules.map((rule, index) => (
            <RuleRow
              key={index}
              rule={rule}
              disabled={locked}
              onChange={(next) => update({ rules: policy.rules.map((r, i) => (i === index ? next : r)) })}
              onRemove={() => update({ rules: policy.rules.filter((_, i) => i !== index) })}
            />
          ))}
          <div className="px-4 py-2.5">
            <Button size="xs" variant="ghost" disabled={locked} onClick={() => update({ rules: [...policy.rules, { kind: "", prefix: "" }] })}>
              <Plus size={13} aria-hidden="true" />
              {t("privacy_masking.settings.add_rule")}
            </Button>
          </div>
        </SettingGroup>
      </Section>

      <Section title={t("privacy_masking.settings.actions_title")} description={t("privacy_masking.settings.actions_desc")}>
        <SettingGroup>
          {actionKinds.map((kind) => (
            <SettingRow
              key={kind}
              label={
                <span className="inline-flex items-center gap-2">
                  <KindDot kind={kind} />
                  {kindLabel(kind)}
                </span>
              }
              description={t(`privacy_masking.settings.action_${actionOf(kind)}_desc`)}
              controlWidth="auto"
              control={
                <SegmentedControl
                  size="sm"
                  ariaLabel={kindLabel(kind)}
                  value={actionOf(kind)}
                  onChange={(action) => setAction(kind, action)}
                  disabled={locked}
                  options={[
                    { value: "mask", label: t("privacy_masking.action.mask") },
                    { value: "warn", label: t("privacy_masking.action.warn") },
                    { value: "block", label: t("privacy_masking.action.block") },
                  ]}
                />
              }
            />
          ))}
        </SettingGroup>
      </Section>

      <Section title={t("privacy_masking.settings.allow_title")} description={t("privacy_masking.settings.allow_desc")}>
        <SettingGroup>
          <div className="px-4 py-3.5">
            <WordListEditor
              values={policy.allow}
              onChange={(allow) => update({ allow })}
              placeholder={t("privacy_masking.settings.allow_placeholder")}
              label={t("privacy_masking.settings.allow_title")}
              disabled={locked}
            />
          </div>
        </SettingGroup>
      </Section>


      {scope === "tenant" ? (
        <Callout tone={settings.key_protected ? "neutral" : "warning"}>
          {settings.key_protected ? t("privacy_masking.settings.key_protected") : t("privacy_masking.settings.key_plain")}
        </Callout>
      ) : null}

      </div>
      {/* top 落在页签栏下方的渐隐带以下：侧栏不是整行宽，不能当钉住区，贴在渐隐带里会被淡掉一截。 */}
      <aside className="flex flex-col gap-3 xl:sticky xl:top-20">
        <Section title={t("privacy_masking.try.title")} description={t("privacy_masking.try.desc")}>
          <SettingGroup>
            <div className="px-4 py-3.5">
              <MaskingTryIt policy={policy} stacked />
            </div>
          </SettingGroup>
        </Section>
        <p className="px-1 text-xs leading-relaxed text-ink-3">{t("privacy_masking.explain.where")}</p>
      </aside>
      </div>
    </div>
  );
}

/**
 * 个人信息的类别：邮箱、手机号、身份证号、银行卡号随「脱敏个人信息」一起开，显示成固定的标签；
 * 其余十类各自可点开关，悬停看说明。四类噪声大（agent 每个请求都带）的默认关。
 */
function PersonalKinds({
  kindOn,
  disabled,
  onToggle,
}: {
  kindOn: (id: string, fallback: boolean) => boolean;
  disabled: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {PERSONAL_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-200">
            <Check size={12} aria-hidden="true" />
            {kindLabel(kind)}
          </span>
        ))}
        {PERSONAL_CATEGORIES.map((category) => {
          const on = kindOn(category.id, category.on);
          return (
            <button
              key={category.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              title={t(`privacy_masking.category.${category.id}_desc`)}
              onClick={() => onToggle(category.id, !on)}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                on
                  ? "bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:bg-sky-400/15 dark:text-sky-200"
                  : "bg-ink/[0.04] text-ink-3 hover:bg-ink/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.09]",
              ].join(" ")}
            >
              {on ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
              {t(`privacy_masking.category.${category.id}`)}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-3">{t("privacy_masking.settings.kinds_hint")}</p>
    </div>
  );
}

function RuleRow({
  rule,
  disabled,
  onChange,
  onRemove,
}: {
  rule: MaskRule;
  disabled: boolean;
  onChange: (rule: MaskRule) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const mode = rule.regex !== undefined && rule.prefix === undefined ? "regex" : "prefix";
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,10rem)_auto_minmax(0,1fr)_auto] sm:items-center">
      <TextInput
        value={rule.kind}
        onChange={(event) => onChange({ ...rule, kind: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
        placeholder={t("privacy_masking.settings.rule_kind")}
        aria-label={t("privacy_masking.settings.rule_kind")}
        disabled={disabled}
        className="font-mono"
      />
      <SegmentedControl
        size="sm"
        ariaLabel={t("privacy_masking.settings.rule_mode")}
        value={mode}
        disabled={disabled}
        onChange={(next) => onChange(next === "regex" ? { kind: rule.kind, regex: rule.prefix ?? "" } : { kind: rule.kind, prefix: rule.regex ?? "" })}
        options={[
          { value: "prefix", label: t("privacy_masking.settings.rule_prefix") },
          { value: "regex", label: t("privacy_masking.settings.rule_regex") },
        ]}
      />
      <TextInput
        value={mode === "regex" ? (rule.regex ?? "") : (rule.prefix ?? "")}
        onChange={(event) =>
          onChange(mode === "regex" ? { kind: rule.kind, regex: event.target.value } : { kind: rule.kind, prefix: event.target.value })
        }
        placeholder={mode === "regex" ? "gw_live_[A-Za-z0-9]{24}" : "gw_live_"}
        aria-label={mode === "regex" ? t("privacy_masking.settings.rule_regex") : t("privacy_masking.settings.rule_prefix")}
        disabled={disabled}
        className="font-mono"
      />
      <Button size="sm" variant="ghost-danger" disabled={disabled} onClick={onRemove} aria-label={t("privacy_masking.settings.remove_rule")}>
        <Trash2 size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
