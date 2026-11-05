import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  quotaCellKey,
  type InFlightUsage,
  type QuotaCellKey,
  type QuotaMatrix,
  type QuotaMetric,
  type QuotaWindow,
} from "@code-proxy/api-client";
import { HoverTooltip, TextInput, cn } from "@code-proxy/ui";
import { parseQuotaInput, type QuotaMatrixDraft } from "../model/policyDraft";
import type { PolicyIssues } from "../model/policyValidation";
import {
  formatQuotaAmount,
  inFlightAmount,
  showsInFlight,
  usageRatio,
  usageTone,
  USAGE_TEXT,
} from "../model/quotaFormat";
import { MetricTile } from "./metricMeta";
import { useIssueText } from "./useIssueText";

export interface QuotaMatrixEditorProps {
  value: QuotaMatrixDraft;
  onChange?: (next: QuotaMatrixDraft) => void;
  /** 整张矩阵只读（绑定模板时、或只读权限）。 */
  readOnly?: boolean;
  /** 可编辑的格子；缺省全部可编辑。其余格子只读显示。 */
  editableCells?: ReadonlySet<QuotaCellKey>;
  /** 对象根本不拥有的格子 → 不可用的原因（悬停显示），例如模板没有累计消费。 */
  unavailableCells?: ReadonlyMap<QuotaCellKey, string>;
  /** 上级天花板（Key 编辑时是账号的额度）：每格下方提示「≤ 上限」。 */
  ceiling?: QuotaMatrix;
  /** 当前用量：每格下方提示「已用 X」，接近上限时变色。 */
  usage?: QuotaMatrix;
  /** 在途预留：提示变成「已用 X · 在途 Y」，颜色按两者之和算（准入检查比的就是这个和）。 */
  inFlight?: InFlightUsage;
  issues?: PolicyIssues;
  /** 错误路径前缀，例如 "limits" 或 "rules.<key>.limits"。 */
  issuePrefix?: string;
  idPrefix: string;
  metrics?: readonly QuotaMetric[];
  /** 规则卡片里用的紧凑版：行头只显示图标与简称。 */
  dense?: boolean;
  /** 读屏用：整张矩阵的名称（例如「账号总额度」「Opus 规则额度」）。 */
  label: string;
}

/**
 * 额度矩阵：行是度量（花费 / 请求 / Token），列是窗口（5 小时 / 日 / 周 / 月 / 累计），
 * 留空即不限制。阶梯一眼可见——同一行从左到右就是从短到长的窗口。
 *
 * 一套输入框同时服务宽窄两种布局：宽屏是整齐的表格，窄屏每个度量一块、每格自带窗口名，
 * 不渲染两份控件（读屏与测试都只会找到一个「花费 · 每日」）。
 */
export function QuotaMatrixEditor({
  value,
  onChange,
  readOnly = false,
  editableCells,
  unavailableCells,
  ceiling,
  usage,
  inFlight,
  issues,
  issuePrefix = "limits",
  idPrefix,
  metrics = QUOTA_METRICS,
  dense = false,
  label,
}: QuotaMatrixEditorProps) {
  const { t } = useTranslation();
  const issueText = useIssueText();
  // 五个窗口固定成五列：账号、模板、Key 的矩阵都是同样的五列，只是个别格子不可用。
  const gridTemplate = dense
    ? "sm:grid-cols-[7rem_repeat(5,minmax(0,1fr))]"
    : "sm:grid-cols-[7.5rem_repeat(5,minmax(0,1fr))]";

  const setCell = (metric: QuotaMetric, window: QuotaWindow, raw: string) => {
    if (!onChange) return;
    onChange({ ...value, [metric]: { ...value[metric], [window]: raw } });
  };

  return (
    <div role="group" aria-label={label} className="space-y-2.5 sm:space-y-1.5">
      <div className={cn("hidden items-end gap-2 px-0.5 sm:grid", gridTemplate)} aria-hidden="true">
        <span />
        {QUOTA_WINDOWS.map((window) => (
          <span key={window} className="text-center text-2xs font-semibold tracking-wide text-ink-3">
            {t(`access_policy.window.${window}`)}
          </span>
        ))}
      </div>
      {metrics.map((metric) => (
        // 顶端对齐：格子下方的「已用 / ≤ 上限」提示只往下长，同一行的输入框始终在一条线上。
        <div key={metric} className={cn("grid grid-cols-2 items-start gap-2", gridTemplate)}>
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:min-h-8">
            <MetricTile metric={metric} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-semibold text-ink">
                {t(dense ? `access_policy.metric_short.${metric}` : `access_policy.metric.${metric}`)}
              </div>
              {dense ? null : (
                <div className="truncate text-2xs text-ink-3">{t(`access_policy.metric_unit.${metric}`)}</div>
              )}
            </div>
          </div>
          {QUOTA_WINDOWS.map((window) => {
            const cell = quotaCellKey(metric, window);
            const raw = value[metric][window];
            const unavailable = unavailableCells?.get(cell);
            const editable = !readOnly && !unavailable && (!editableCells || editableCells.has(cell));
            const issue = issues?.[`${issuePrefix}.${cell}`];
            const inputId = `${idPrefix}-${metric}-${window}`;
            const hintId = `${inputId}-hint`;
            const cellLabel = `${t(`access_policy.metric.${metric}`)} · ${t(`access_policy.window.${window}`)}`;
            const parsed = parseQuotaInput(metric, raw);
            const limit = parsed.value ?? 0;
            const used = usage?.[metric][window];
            const ceilingValue = ceiling?.[metric][window] ?? 0;
            let hint: ReactNode = null;
            if (issue) {
              hint = <span className="text-rose-600 dark:text-rose-400">{issueText(issue)}</span>;
            } else if (typeof used === "number" && (limit > 0 || used > 0)) {
              const held = inFlightAmount(inFlight, metric);
              const tone = usageTone(usageRatio(used + held, limit));
              const withHeld = showsInFlight(metric, held);
              const text = withHeld
                ? t("access_policy.cell_used_in_flight", {
                    used: formatQuotaAmount(metric, used),
                    held: formatQuotaAmount(metric, held),
                  })
                : t("access_policy.cell_used", { used: formatQuotaAmount(metric, used) });
              // 带在途的那句更长，窄格子里会被截断：title 留一份完整的。
              hint = (
                <span className={limit > 0 ? USAGE_TEXT[tone] : "text-ink-3"} title={withHeld ? text : undefined}>
                  {text}
                </span>
              );
            } else if (ceilingValue > 0 && editable) {
              hint = t("access_policy.cell_ceiling", { limit: formatQuotaAmount(metric, ceilingValue) });
            }
            return (
              <div key={window} className="min-w-0">
                <label htmlFor={inputId} className="mb-1 block text-2xs font-medium text-ink-3 sm:hidden">
                  {t(`access_policy.window.${window}`)}
                </label>
                {unavailable ? (
                  <HoverTooltip content={unavailable} className="!flex w-full">
                    <span
                      id={inputId}
                      aria-label={`${cellLabel}: ${unavailable}`}
                      className="flex h-8 w-full items-center justify-center rounded-full bg-ink/[0.03] text-xs text-ink-4 dark:bg-white/[0.04]"
                    >
                      —
                    </span>
                  </HoverTooltip>
                ) : editable ? (
                  <TextInput
                    id={inputId}
                    size="sm"
                    inputMode={metric === "cost" ? "decimal" : "text"}
                    value={raw}
                    placeholder={t("access_policy.unlimited_short")}
                    aria-label={cellLabel}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={hint ? hintId : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    className="text-center tabular-nums"
                    onChange={(event) => setCell(metric, window, event.target.value)}
                  />
                ) : (
                  <span
                    id={inputId}
                    aria-label={`${cellLabel}: ${limit > 0 ? formatQuotaAmount(metric, limit) : t("access_policy.unlimited_short")}`}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-full px-2 text-xs tabular-nums",
                      limit > 0
                        ? "bg-ink/[0.05] font-semibold text-ink dark:bg-white/[0.07]"
                        : "bg-ink/[0.03] text-ink-4 dark:bg-white/[0.04]",
                    )}
                  >
                    {limit > 0 ? formatQuotaAmount(metric, limit) : t("access_policy.unlimited_short")}
                  </span>
                )}
                {hint ? (
                  <div id={hintId} className="mt-1 truncate text-center text-2xs tabular-nums text-ink-3">
                    {hint}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
