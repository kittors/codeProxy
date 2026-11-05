import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Lock, Plus, Save, Trash2, Undo2 } from "lucide-react";
import {
  Button,
  Callout,
  SegmentedControl,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
  surface,
} from "@code-proxy/ui";
import type { MaskKindAction, MaskRule, PrivacyMaskPolicy, PrivacyMaskPreview } from "@code-proxy/api-client";
import { KindDot, useKindLabel } from "./KindChip";
import { maskCategory } from "./maskKinds";
import { MaskingTryIt } from "./MaskingTryIt";
import { PortalMaskingStatus } from "./PortalMaskingStatus";
import type { MaskingSettingsView } from "./source";
import { WordListEditor } from "./WordListEditor";

/** 打开「个人信息」后另有的类别：前六个默认开，后四个噪声大（agent 每个请求都带）默认关。 */
const PERSONAL_CATEGORIES: Array<{ id: string; on: boolean }> = [
  { id: "ssn", on: true },
  { id: "passport", on: true },
  { id: "iban", on: true },
  { id: "birthday", on: true },
  { id: "mac", on: true },
  { id: "serial", on: true },
  { id: "home", on: false },
  { id: "userhost", on: false },
  { id: "ip", on: false },
  { id: "bucket", on: false },
];

const SECRET_KINDS = ["API_KEY", "PRIVATE_KEY", "TOKEN", "PASSWORD", "SECRET"];
const PERSONAL_KINDS = ["EMAIL", "PHONE", "ID_CARD", "BANK_CARD"];

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
 * 脱敏设置。控制台里是租户的默认设置，外加「强制开启」和「门户账号能否自己设置」；门户里是
 * 门户用户自己的设置，被租户强制开启的类目显示成锁定的行，关不掉。
 *
 * 改动先放在草稿里，出现保存栏；「试一试」用的是草稿，保存前就能看到效果。控制台的保存栏钉在
 * 顶上；门户里钉在标签滚动区的底部，和门户的敏感词一样。
 *
 * 门户里强制开启的类目：开关锁定；处理方式不能选「提醒」（服务器会改回脱敏，原样发出正是强制
 * 要排除的）；「从不脱敏」对它们无效，在那一组写明。
 */
export function MaskingSettingsPanel({
  settings,
  scope,
  canWrite,
  saving,
  onSave,
  onReset,
  preview,
}: {
  settings: MaskingSettingsView;
  scope: "tenant" | "portal";
  canWrite: boolean;
  saving: boolean;
  onSave: (next: MaskingSettingsView) => void;
  /** 门户：删掉自己的设置，回到管理员的默认设置。 */
  onReset?: () => Promise<void>;
  preview: (text: string, policy: PrivacyMaskPolicy) => Promise<PrivacyMaskPreview>;
}) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const [draft, setDraft] = useState(settings);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const policy = draft.policy;
  const locked = !canWrite || saving;
  const portal = scope === "portal";
  const enforced = new Set(portal ? settings.enforced : []);
  const secretsOn = policy.secrets || enforced.has("secrets");
  const personalOn = policy.personal || enforced.has("personal");
  /** 这个类型属于强制开启的类目（只在门户里有）。 */
  const enforcedKind = (kind: string) => {
    const category = maskCategory(kind);
    return (category === "secret" && enforced.has("secrets")) || (category === "personal" && enforced.has("personal"));
  };

  const update = (patch: Partial<PrivacyMaskPolicy>) => setDraft((d) => ({ ...d, policy: { ...d.policy, ...patch } }));
  const kindOn = (id: string, fallback: boolean) => policy.kinds[id] ?? fallback;
  // 强制的类目存着「提醒」也按脱敏处理（服务器这样合并），显示成实际生效的那个
  const actionOf = (kind: string): MaskKindAction => {
    const action = policy.actions[kind] ?? "mask";
    return action === "warn" && enforcedKind(kind) ? "mask" : action;
  };
  const setAction = (kind: string, action: MaskKindAction) => {
    const next = { ...policy.actions };
    if (action === "mask") delete next[kind];
    else next[kind] = action;
    update({ actions: next });
  };

  const actionKinds = [
    ...(secretsOn ? SECRET_KINDS : []),
    ...(personalOn ? PERSONAL_KINDS : []),
    ...(policy.words.length > 0 ? ["TERM"] : []),
    ...policy.rules.map((r) => r.kind).filter((k, i, all) => k && all.indexOf(k) === i),
  ];
  const lockedRow = (id: string) =>
    enforced.has(id) ? (
      <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-2xs font-medium text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
        <Lock size={11} aria-hidden="true" />
        {t("privacy_masking.settings.enforced_badge")}
      </span>
    ) : null;

  const saveBar = dirty ? (
    <div
      role="region"
      aria-label={t("privacy_masking.settings.unsaved")}
      className={
        portal
          ? `${surface({ tone: "card", radius: "2xl" })} sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-2 px-3 py-2`
          : "sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-canvas/95 px-1 py-2 backdrop-blur-sm"
      }
    >
      <span className="mr-auto inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
        {t("privacy_masking.settings.unsaved")}
      </span>
      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(settings)}>
        <Undo2 size={14} aria-hidden="true" />
        {t("privacy_masking.settings.discard")}
      </Button>
      <Button size="sm" variant="primary" disabled={locked} onClick={() => onSave(draft)}>
        <Save size={14} aria-hidden="true" />
        {saving ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {portal ? null : saveBar}
      {portal ? <PortalMaskingStatus settings={settings} busy={saving} onReset={onReset} /> : null}

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
            badges={lockedRow("secrets")}
            controlWidth="auto"
            control={
              <ToggleSwitch
                checked={secretsOn}
                disabled={locked || enforced.has("secrets")}
                onCheckedChange={(secrets) => update({ secrets })}
                ariaLabel={t("privacy_masking.settings.secrets")}
              />
            }
          />
          <SettingRow
            label={t("privacy_masking.settings.personal")}
            description={t("privacy_masking.settings.personal_desc")}
            badges={lockedRow("personal")}
            controlWidth="auto"
            control={
              <ToggleSwitch
                checked={personalOn}
                disabled={locked || enforced.has("personal")}
                onCheckedChange={(personal) => update({ personal })}
                ariaLabel={t("privacy_masking.settings.personal")}
              />
            }
          >
            {personalOn ? (
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
              description={
                enforcedKind(kind)
                  ? `${t(`privacy_masking.settings.action_${actionOf(kind)}_desc`)} · ${t("privacy_masking.portal.action_enforced")}`
                  : t(`privacy_masking.settings.action_${actionOf(kind)}_desc`)
              }
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
                    { value: "warn", label: t("privacy_masking.action.warn"), disabled: enforcedKind(kind) },
                    { value: "block", label: t("privacy_masking.action.block") },
                  ]}
                />
              }
            />
          ))}
        </SettingGroup>
      </Section>

      <Section
        title={t("privacy_masking.settings.allow_title")}
        description={
          enforced.size > 0
            ? `${t("privacy_masking.settings.allow_desc")} ${t("privacy_masking.portal.allow_enforced")}`
            : t("privacy_masking.settings.allow_desc")
        }
      >
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
        <Section title={t("privacy_masking.settings.manage_title")} description={t("privacy_masking.settings.manage_desc")}>
          <SettingGroup>
            <SettingRow
              label={t("privacy_masking.settings.enforce")}
              description={t("privacy_masking.settings.enforce_desc")}
              controlWidth="lg"
              control={
                <div className="flex flex-wrap justify-end gap-1.5">
                  {["secrets", "personal"].map((id) => {
                    const on = draft.enforced.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={locked}
                        aria-pressed={on}
                        onClick={() =>
                          setDraft((d) => ({ ...d, enforced: on ? d.enforced.filter((x) => x !== id) : [...d.enforced, id] }))
                        }
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          on ? "bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200" : "bg-ink/[0.04] text-ink-2 hover:bg-ink/[0.07] dark:bg-white/[0.06]",
                        ].join(" ")}
                      >
                        {on ? <Lock size={11} aria-hidden="true" /> : null}
                        {t(`privacy_masking.settings.${id}`)}
                      </button>
                    );
                  })}
                </div>
              }
            />
            <SettingRow
              controlWidth="auto"
              label={t("privacy_masking.settings.portal")}
              description={t("privacy_masking.settings.portal_desc")}
              control={
                <ToggleSwitch
                  checked={draft.portal_default_allowed}
                  disabled={locked}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, portal_default_allowed: v }))}
                  ariaLabel={t("privacy_masking.settings.portal")}
                />
              }
            />
          </SettingGroup>
          <Callout tone={settings.key_protected ? "neutral" : "warning"}>
            {settings.key_protected ? t("privacy_masking.settings.key_protected") : t("privacy_masking.settings.key_plain")}
          </Callout>
        </Section>
      ) : null}

      </div>
      <aside className="flex flex-col gap-3 xl:sticky xl:top-16">
        <Section title={t("privacy_masking.try.title")} description={portal ? t("privacy_masking.portal.try_desc") : t("privacy_masking.try.desc")}>
          <SettingGroup>
            <div className="px-4 py-3.5">
              <MaskingTryIt policy={policy} preview={preview} stacked />
            </div>
          </SettingGroup>
        </Section>
        <p className="px-1 text-xs leading-relaxed text-ink-3">{t("privacy_masking.explain.where")}</p>
      </aside>
      </div>
      {portal ? saveBar : null}
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
