import { useTranslation } from "react-i18next";
import type {
  PayloadParamOutcome,
  PayloadRuleOutcome,
  PayloadRulesDryRunResult,
} from "@code-proxy/api-client";
import type { PayloadDraftSection } from "@features/visual-config-editor";
import { Callout } from "@code-proxy/ui";

/** 后端按草稿里的序号回报；草稿去掉了没填模型的规则，要对回页面上的「规则 N」。 */
function ruleNumber(
  outcome: PayloadRuleOutcome,
  formIndexes: Record<PayloadDraftSection, number[]>,
): number {
  const section = outcome.section;
  if (section === "default" || section === "override" || section === "filter") {
    const formIndex = formIndexes[section][outcome.index];
    if (formIndex !== undefined) return formIndex + 1;
  }
  return outcome.index + 1;
}

function JsonValue({ value, empty }: { value?: string; empty: string }) {
  if (value === undefined) return <span className="text-ink-3">{empty}</span>;
  return <code className="font-mono text-xs break-all text-ink">{value}</code>;
}

function ParamLine({ param }: { param: PayloadParamOutcome }) {
  const { t } = useTranslation();
  const path = <code className="font-mono text-xs text-ink">{param.path || "∅"}</code>;
  if (param.action === "set") {
    return (
      <li className="text-xs leading-5 text-ink-2">
        {t("config_ui.payload.dry_run.param_set")} {path} ={" "}
        <JsonValue value={param.value} empty="" />
      </li>
    );
  }
  if (param.action === "removed") {
    return (
      <li className="text-xs leading-5 text-ink-2">
        {t("config_ui.payload.dry_run.param_removed")} {path}
      </li>
    );
  }
  return (
    <li className="text-xs leading-5 text-ink-3">
      {t("config_ui.payload.dry_run.param_skipped")} {path}
      {t("config_ui.payload.dry_run.skip_reason", {
        reason: t(`config_ui.payload.dry_run.skip.${param.reason ?? "invalid-path"}`),
      })}
    </li>
  );
}

/** 试运行的结果：改了哪些路径、每条规则做了什么、改写后的完整请求体。 */
export function PayloadRuleDryRunResult({
  result,
  formIndexes,
}: {
  result: PayloadRulesDryRunResult;
  formIndexes: Record<PayloadDraftSection, number[]>;
}) {
  const { t } = useTranslation();
  const sectionLabel = (section: PayloadRuleOutcome["section"]) =>
    t(`config_ui.payload.dry_run.section.${section}`);

  return (
    <div className="space-y-3" aria-live="polite">
      {result.dropped && result.dropped.length > 0 ? (
        <Callout tone="warning">
          {result.dropped.map((rule) => (
            <div key={`${rule.section}-${rule.index}`}>
              {t("config_ui.payload.dry_run.dropped", {
                section: sectionLabel(rule.section),
                n: rule.index + 1,
                param: rule.param,
              })}
            </div>
          ))}
        </Callout>
      ) : null}

      <div className="rounded-xl bg-subtle p-4">
        <h4 className="text-xs font-semibold text-ink">
          {result.changes.length > 0
            ? t("config_ui.payload.dry_run.changes", { count: result.changes.length })
            : t("config_ui.payload.dry_run.no_changes")}
        </h4>
        {result.changes.length > 0 ? (
          <table className="mt-2 w-full table-fixed text-left">
            <thead>
              <tr className="text-2xs text-ink-3">
                <th className="w-1/3 pb-1 font-medium">{t("config_ui.payload.dry_run.path")}</th>
                <th className="w-1/3 pb-1 font-medium">{t("config_ui.payload.dry_run.before")}</th>
                <th className="w-1/3 pb-1 font-medium">{t("config_ui.payload.dry_run.after")}</th>
              </tr>
            </thead>
            <tbody>
              {result.changes.map((change) => (
                <tr key={change.path} className="align-top">
                  <td className="py-1 pr-3">
                    <code className="font-mono text-xs break-all text-ink">{change.path}</code>
                  </td>
                  <td className="py-1 pr-3">
                    <JsonValue
                      value={change.before}
                      empty={t("config_ui.payload.dry_run.absent")}
                    />
                  </td>
                  <td className="py-1">
                    <JsonValue
                      value={change.after}
                      empty={t("config_ui.payload.dry_run.removed")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="rounded-xl bg-subtle p-4">
        <h4 className="text-xs font-semibold text-ink">{t("config_ui.payload.dry_run.rules")}</h4>
        {result.models.length > 0 ? (
          <p className="mt-1 text-xs text-ink-3">
            {t("config_ui.payload.dry_run.models", { models: result.models.join(" → ") })}
          </p>
        ) : null}
        {result.rules.length === 0 ? (
          <p className="mt-2 text-xs text-ink-3">{t("config_ui.payload.dry_run.no_rules")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {result.rules.map((rule) => (
              <li key={`${rule.section}-${rule.index}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-ink">
                    {t("config_ui.payload.dry_run.rule_title", {
                      section: sectionLabel(rule.section),
                      n: ruleNumber(rule, formIndexes),
                    })}
                  </span>
                  {rule.matched ? (
                    <span className="rounded-full bg-accent-soft px-2 py-px text-2xs font-medium text-accent-ink colorful:bg-emerald-500/10 colorful:text-emerald-700 colorful:dark:text-emerald-300">
                      {t("config_ui.payload.dry_run.matched", {
                        pattern: rule.pattern,
                        model: rule.model,
                      })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-selected px-2 py-px text-2xs font-medium text-ink-3">
                      {t(`config_ui.payload.dry_run.miss.${rule.miss ?? "model"}`)}
                    </span>
                  )}
                </div>
                {rule.matched && rule.params && rule.params.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {rule.params.map((param, index) => (
                      <ParamLine key={`${param.path}-${index}`} param={param} />
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-xl bg-subtle p-4">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          {t("config_ui.payload.dry_run.body_after")}
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto font-mono text-xs leading-5 whitespace-pre text-ink">
          {result.body}
        </pre>
      </details>
    </div>
  );
}
