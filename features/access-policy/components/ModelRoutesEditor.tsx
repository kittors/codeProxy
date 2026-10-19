import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowRight, ArrowUp, Plus, Route, Trash2 } from "lucide-react";
import { Button, EmptyState, HUE_GLYPH, cn } from "@code-proxy/ui";
import { emptyRouteDraft, type ModelRouteDraft } from "../model/policyDraft";
import { MAX_MODEL_ROUTES, hasIssueUnder, type PolicyIssues } from "../model/policyValidation";
import { ModelPatternChip, ModelPatternInput, type ModelOption } from "./ModelPatternInput";
import { ModelTargetInput } from "./ModelTargetInput";
import { useIssueText } from "./useIssueText";

export interface ModelRoutesEditorProps {
  value: ModelRouteDraft[];
  onChange?: (next: ModelRouteDraft[]) => void;
  readOnly?: boolean;
  catalog: readonly ModelOption[];
  issues?: PolicyIssues;
  idPrefix: string;
}

const move = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/**
 * 模型路由：把请求的模型改写成另一个模型，例如把 claude-opus-* 改用 claude-sonnet-4-5。
 * 按顺序匹配、第一条命中的生效，且只改写一次（A→B、B→C 时请求 A 得到 B），所以行可以上下移动。
 */
export function ModelRoutesEditor({
  value,
  onChange,
  readOnly = false,
  catalog,
  issues = {},
  idPrefix,
}: ModelRoutesEditorProps) {
  const { t } = useTranslation();
  const issueText = useIssueText();
  const editable = !readOnly && Boolean(onChange);

  const update = (key: string, patch: Partial<ModelRouteDraft>) =>
    onChange?.(value.map((route) => (route.key === key ? { ...route, ...patch } : route)));
  const addRoute = () => onChange?.([...value, emptyRouteDraft()]);

  if (value.length === 0) {
    return (
      <EmptyState
        icon={<Route size={28} className={cn("text-ink-3", HUE_GLYPH.teal)} />}
        title={t("access_policy.routes_empty_title")}
        description={t(readOnly ? "access_policy.routes_empty_readonly" : "access_policy.routes_empty_desc")}
        action={
          editable ? (
            <Button size="sm" variant="secondary" onClick={addRoute}>
              <Plus size={14} />
              {t("access_policy.add_route")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {issues.routes ? (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {issueText(issues.routes)}
        </p>
      ) : null}
      <ol className="space-y-2.5">
        {value.map((route, index) => {
          const prefix = `routes.${route.key}`;
          const fromIssue = issues[`${prefix}.from`];
          const toIssue = issues[`${prefix}.to`];
          const rowId = `${idPrefix}-route-${index}`;
          const position = index + 1;
          return (
            <li
              key={route.key}
              aria-label={t("access_policy.route_label", { index: position })}
              className={cn(
                "rounded-2xl bg-subtle p-3.5",
                hasIssueUnder(issues, prefix) ? "ring-1 ring-rose-500/40" : null,
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-xs font-semibold tabular-nums text-ink-2 dark:bg-white/[0.07] icon-hue:bg-teal-500/10 icon-hue:text-teal-600 icon-hue:dark:bg-teal-400/15 icon-hue:dark:text-teal-300"
                >
                  {position}
                </span>
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.8fr)] md:items-start">
                  <div className="min-w-0">
                    <div className="mb-1 text-2xs font-medium text-ink-3">{t("access_policy.route_from")}</div>
                    {editable ? (
                      <ModelPatternInput
                        id={`${rowId}-from`}
                        value={route.from}
                        onChange={(from) => update(route.key, { from })}
                        catalog={catalog}
                        ariaLabel={t("access_policy.route_from_label", { index: position })}
                        placeholder={t("access_policy.route_from_placeholder")}
                        invalid={Boolean(fromIssue)}
                        describedBy={fromIssue ? `${rowId}-from-issue` : undefined}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {route.from.map((pattern) => (
                          <ModelPatternChip key={pattern} pattern={pattern} />
                        ))}
                      </div>
                    )}
                    {fromIssue ? (
                      <p id={`${rowId}-from-issue`} className="mt-1 text-2xs text-rose-600 dark:text-rose-400">
                        {issueText(fromIssue)}
                      </p>
                    ) : null}
                  </div>
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className={cn("hidden shrink-0 text-ink-3 md:mt-7 md:block", HUE_GLYPH.teal)}
                  />
                  <div className="min-w-0">
                    <div className="mb-1 text-2xs font-medium text-ink-3">{t("access_policy.route_to")}</div>
                    {editable ? (
                      <ModelTargetInput
                        id={`${rowId}-to`}
                        value={route.to}
                        onChange={(to) => update(route.key, { to })}
                        catalog={catalog}
                        ariaLabel={t("access_policy.route_to_label", { index: position })}
                        placeholder={t("access_policy.route_to_placeholder")}
                        invalid={Boolean(toIssue)}
                        describedBy={toIssue ? `${rowId}-to-issue` : undefined}
                      />
                    ) : (
                      <ModelPatternChip pattern={route.to} />
                    )}
                    {toIssue ? (
                      <p id={`${rowId}-to-issue`} className="mt-1 text-2xs text-rose-600 dark:text-rose-400">
                        {issueText(toIssue)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {editable ? (
                  <div className="flex shrink-0 flex-col items-center gap-0.5 md:mt-5 md:flex-row">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={t("access_policy.move_route_up", { index: position })}
                      onClick={() => onChange?.(move(value, index, index - 1))}
                    >
                      <ArrowUp size={13} />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={index === value.length - 1}
                      aria-label={t("access_policy.move_route_down", { index: position })}
                      onClick={() => onChange?.(move(value, index, index + 1))}
                    >
                      <ArrowDown size={13} />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={t("access_policy.remove_route", { index: position })}
                      onClick={() => onChange?.(value.filter((item) => item.key !== route.key))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {editable ? (
        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="secondary" onClick={addRoute} disabled={value.length >= MAX_MODEL_ROUTES}>
            <Plus size={14} />
            {t("access_policy.add_route")}
          </Button>
          <span className="text-2xs tabular-nums text-ink-3">
            {t("access_policy.routes_count", { count: value.length, max: MAX_MODEL_ROUTES })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
