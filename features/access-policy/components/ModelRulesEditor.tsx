import { useTranslation } from "react-i18next";
import { Boxes, CornerDownRight, Plus, Trash2 } from "lucide-react";
import type { QuotaUsageView } from "@code-proxy/api-client";
import { Button, EmptyState, HUE_GLYPH, TextInput, cn } from "@code-proxy/ui";
import { emptyRuleDraft, type ModelRuleDraft } from "../model/policyDraft";
import { MAX_MODEL_RULES, hasIssueUnder, type PolicyIssues } from "../model/policyValidation";
import { ModelPatternChip, ModelPatternInput, type ModelOption } from "./ModelPatternInput";
import { ModelTargetInput } from "./ModelTargetInput";
import { QuotaMatrixEditor } from "./QuotaMatrixEditor";
import { useIssueText } from "./useIssueText";

export interface ModelRulesEditorProps {
  value: ModelRuleDraft[];
  onChange?: (next: ModelRuleDraft[]) => void;
  readOnly?: boolean;
  catalog: readonly ModelOption[];
  issues?: PolicyIssues;
  /** 每条规则当前的用量（按规则 id），矩阵每格下方显示「已用」。 */
  usage?: QuotaUsageView;
  /** 后端支持超额降级时才显示降级模型。 */
  allowFallback: boolean;
  idPrefix: string;
}

/** 卡片底：弹窗本身已是一张卡，规则卡用无边的淡色井，不再叠一层描边。 */
const RULE_CARD = "rounded-2xl bg-subtle p-4";

/**
 * 按模型规则：一组模型模式配一套自己的额度，叠加在总额度之上——命中的请求两层都要满足。
 * 一个模型可以同时命中多条规则（例如 claude-* 与 claude-opus-*），每条的额度都要满足。
 * 可选的降级模型让用完额度的请求改用别的模型继续服务，而不是直接被拒。
 */
export function ModelRulesEditor({
  value,
  onChange,
  readOnly = false,
  catalog,
  issues = {},
  usage,
  allowFallback,
  idPrefix,
}: ModelRulesEditorProps) {
  const { t } = useTranslation();
  const issueText = useIssueText();
  const usedByRule = new Map(usage?.rules.map((item) => [item.id, item.used]) ?? []);
  const editable = !readOnly && Boolean(onChange);

  const update = (key: string, patch: Partial<ModelRuleDraft>) =>
    onChange?.(value.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)));

  const addRule = () => onChange?.([...value, emptyRuleDraft()]);

  if (value.length === 0) {
    return (
      <EmptyState
        icon={<Boxes size={28} className={cn("text-ink-3", HUE_GLYPH.indigo)} />}
        title={t("access_policy.rules_empty_title")}
        description={t(readOnly ? "access_policy.rules_empty_readonly" : "access_policy.rules_empty_desc")}
        action={
          editable ? (
            <Button size="sm" variant="secondary" onClick={addRule}>
              <Plus size={14} />
              {t("access_policy.add_rule")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {issues.rules ? (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {issueText(issues.rules)}
        </p>
      ) : null}
      {value.map((rule, index) => {
        const prefix = `rules.${rule.key}`;
        const modelsIssue = issues[`${prefix}.models`];
        const limitsIssue = issues[`${prefix}.limits`];
        const fallbackIssue = issues[`${prefix}.fallback`];
        const nameIssue = issues[`${prefix}.name`];
        const ruleId = `${idPrefix}-rule-${index}`;
        const title = rule.name.trim() || t("access_policy.rule_untitled", { index: index + 1 });
        return (
          <section
            key={rule.key}
            aria-label={title}
            className={cn(RULE_CARD, hasIssueUnder(issues, prefix) ? "ring-1 ring-rose-500/40" : null)}
          >
            <header className="mb-3 flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-xs font-semibold tabular-nums text-ink-2 dark:bg-white/[0.07] icon-hue:bg-indigo-500/10 icon-hue:text-indigo-600 icon-hue:dark:bg-indigo-400/15 icon-hue:dark:text-indigo-300"
              >
                {index + 1}
              </span>
              {editable ? (
                <div className="min-w-0 flex-1">
                  <TextInput
                    size="sm"
                    value={rule.name}
                    placeholder={t("access_policy.rule_name_placeholder")}
                    aria-label={t("access_policy.rule_name_label", { index: index + 1 })}
                    aria-invalid={nameIssue ? true : undefined}
                    onChange={(event) => update(rule.key, { name: event.target.value })}
                  />
                  {nameIssue ? (
                    <p className="mt-1 text-2xs text-rose-600 dark:text-rose-400">{issueText(nameIssue)}</p>
                  ) : null}
                </div>
              ) : (
                <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</h4>
              )}
              {editable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("access_policy.remove_rule", { name: title })}
                  onClick={() => onChange?.(value.filter((item) => item.key !== rule.key))}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </header>

            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-medium text-ink-2" id={`${ruleId}-models-label`}>
                  {t("access_policy.rule_models")}
                </div>
                {editable ? (
                  <ModelPatternInput
                    id={`${ruleId}-models`}
                    value={rule.models}
                    onChange={(models) => update(rule.key, { models })}
                    catalog={catalog}
                    ariaLabel={t("access_policy.rule_models_label", { name: title })}
                    placeholder={t("access_policy.rule_models_placeholder")}
                    invalid={Boolean(modelsIssue)}
                    describedBy={`${ruleId}-models-hint`}
                  />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {rule.models.map((pattern) => (
                      <ModelPatternChip key={pattern} pattern={pattern} />
                    ))}
                  </div>
                )}
                <p
                  id={`${ruleId}-models-hint`}
                  className={cn("mt-1 text-2xs", modelsIssue ? "text-rose-600 dark:text-rose-400" : "text-ink-3")}
                >
                  {modelsIssue ? issueText(modelsIssue) : editable ? t("access_policy.rule_models_hint") : null}
                </p>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-ink-2">{t("access_policy.rule_limits")}</div>
                <QuotaMatrixEditor
                  value={rule.limits}
                  onChange={editable ? (limits) => update(rule.key, { limits }) : undefined}
                  readOnly={!editable}
                  usage={rule.id ? usedByRule.get(rule.id) : undefined}
                  issues={issues}
                  issuePrefix={`${prefix}.limits`}
                  idPrefix={`${ruleId}-limits`}
                  label={t("access_policy.rule_limits_label", { name: title })}
                  dense
                />
                {limitsIssue ? (
                  <p role="alert" className="mt-1.5 text-2xs text-rose-600 dark:text-rose-400">
                    {issueText(limitsIssue)}
                  </p>
                ) : null}
              </div>

              {allowFallback && (editable || rule.fallback) ? (
                // 标签列与上方紧凑矩阵的行头同宽（7rem），降级模型的输入框与矩阵第一列左对齐。
                <div className="grid gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start sm:gap-2">
                  <label
                    htmlFor={`${ruleId}-fallback`}
                    className="flex items-center gap-1.5 pt-1.5 text-xs font-medium text-ink-2"
                  >
                    <CornerDownRight size={13} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.teal)} />
                    {t("access_policy.rule_fallback")}
                  </label>
                  <div className="min-w-0">
                    {editable ? (
                      <ModelTargetInput
                        id={`${ruleId}-fallback`}
                        value={rule.fallback}
                        onChange={(fallback) => update(rule.key, { fallback })}
                        catalog={catalog}
                        ariaLabel={t("access_policy.rule_fallback_label", { name: title })}
                        placeholder={t("access_policy.rule_fallback_placeholder")}
                        invalid={Boolean(fallbackIssue)}
                        describedBy={`${ruleId}-fallback-hint`}
                      />
                    ) : (
                      <span id={`${ruleId}-fallback`}>
                        <ModelPatternChip pattern={rule.fallback} />
                      </span>
                    )}
                    <p
                      id={`${ruleId}-fallback-hint`}
                      className={cn("mt-1 text-2xs", fallbackIssue ? "text-rose-600 dark:text-rose-400" : "text-ink-3")}
                    >
                      {fallbackIssue ? issueText(fallbackIssue) : t("access_policy.rule_fallback_hint")}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
      {editable ? (
        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="secondary" onClick={addRule} disabled={value.length >= MAX_MODEL_RULES}>
            <Plus size={14} />
            {t("access_policy.add_rule")}
          </Button>
          <span className="text-2xs tabular-nums text-ink-3">
            {t("access_policy.rules_count", { count: value.length, max: MAX_MODEL_RULES })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
