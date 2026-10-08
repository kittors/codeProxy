import { RotateCcw } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/selectStyles";

/**
 * 一组设置：一行一项，行间细线分隔（和系统设置里的分组列表同一种读法）。
 *
 * 默认是一张卡片（伪元素细边 + 投影），给直接放在页面上的设置组用；放进弹窗时传 `flat`：
 * 弹窗本身已经是一层，里面再套一张卡就是「框里套框」，扁平组只留行间分隔线。
 */
export function SettingGroup({
  children,
  className,
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div
      data-slot="setting-group"
      className={cn(
        "divide-y divide-line",
        flat
          ? // 扁平组没有卡片边，行也不再缩进，和弹窗里其它字段左右对齐。
            "[&>[data-slot=setting-row]]:px-0"
          : "cp-edge overflow-hidden rounded-2xl bg-surface shadow-card [--cp-backdrop:var(--cp-surface)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type SettingControlWidth = "auto" | "sm" | "md" | "lg" | "full";

// 控件列的宽度：开关只占自身；短数字 / 端口用 sm；路径、地址用 md / lg；
// full 表示控件放到说明下方、占满整行（多行文本、规则列表）。
const CONTROL_COLUMN: Record<Exclude<SettingControlWidth, "full">, string> = {
  auto: "sm:grid-cols-[minmax(0,1fr)_auto]",
  sm: "sm:grid-cols-[minmax(0,1fr)_minmax(8rem,11rem)]",
  md: "sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]",
  lg: "sm:grid-cols-[minmax(0,1fr)_minmax(14rem,24rem)]",
};

/**
 * 设置行：左边说清「这是什么、改了会怎样」，右边是控件。
 *
 * - 名称用人话（「监听地址」），技术键名（`host`）作为辅助信息放在说明后面，
 *   熟悉 config.yaml 的人照样能对上号；
 * - 说明常驻显示，不藏进悬停提示——设置页最常见的问题就是「这个开关到底管什么」；
 * - `modified` 时名称前出现一个小圆点，并给出「撤销」，改了哪里一目了然；
 * - `badges` 放「需重启」「安全相关」这类提示标签。
 */
export function SettingRow({
  label,
  description,
  meta,
  badges,
  control,
  controlWidth = "md",
  htmlFor,
  modified = false,
  onReset,
  error,
  highlighted = false,
  id,
  className,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** 技术名称，例如 YAML 键；用等宽小字显示。 */
  meta?: ReactNode;
  badges?: ReactNode;
  control?: ReactNode;
  controlWidth?: SettingControlWidth;
  /** 控件的 id：点名称即可聚焦 / 切换控件。 */
  htmlFor?: string;
  modified?: boolean;
  onReset?: () => void;
  /** 校验错误：显示在说明下方，并把控件标成 aria-invalid。 */
  error?: ReactNode;
  /** 搜索命中或从别处跳转过来时短暂高亮。 */
  highlighted?: boolean;
  id?: string;
  className?: string;
  /** 放在整行下方的附加内容（例如开关打开后才出现的子设置）。 */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const errorId = useId();
  const full = controlWidth === "full";
  const LabelTag = htmlFor ? "label" : "span";
  const hasDescription = Boolean(description || meta);
  // 把说明挂到控件上（aria-describedby），读屏时聚焦到开关 / 输入框就能听到它管什么。
  const describedBy = [hasDescription ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const describedControl =
    describedBy && isValidElement(control)
      ? cloneElement(control as ReactElement<Record<string, unknown>>, {
          "aria-describedby":
            (control as ReactElement<Record<string, unknown>>).props["aria-describedby"] ??
            describedBy,
          ...(error ? { "aria-invalid": true } : {}),
        })
      : control;

  return (
    <div
      id={id}
      data-slot="setting-row"
      data-modified={modified || undefined}
      className={cn(
        "relative px-5 py-4 transition-colors duration-500",
        highlighted ? "bg-accent-soft colorful:bg-sky-500/[0.07]" : null,
        className,
      )}
    >
      <div
        className={cn(
          "grid items-center gap-x-8 gap-y-3",
          full ? "grid-cols-1" : cn("grid-cols-1", CONTROL_COLUMN[controlWidth]),
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {modified ? (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent colorful:bg-sky-500"
              />
            ) : null}
            <LabelTag
              {...(htmlFor ? { htmlFor } : {})}
              className="text-sm font-medium text-ink"
            >
              {label}
            </LabelTag>
            {modified ? (
              <span className="sr-only">{t("common.modified", { defaultValue: "已修改" })}</span>
            ) : null}
            {badges}
            {modified && onReset ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <RotateCcw size={12} aria-hidden="true" />
                {t("common.revert", { defaultValue: "撤销" })}
              </button>
            ) : null}
          </div>
          {hasDescription ? (
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-ink-3">
              {description}
              {meta ? (
                <code
                  className={cn(
                    "rounded-md bg-subtle px-1.5 py-px font-mono text-2xs text-ink-3",
                    description ? "ml-1.5" : null,
                  )}
                >
                  {meta}
                </code>
              ) : null}
            </p>
          ) : null}
          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-xs leading-5 text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
        </div>
        {control ? (
          <div className={cn("min-w-0", full ? null : "sm:justify-self-end sm:w-full", controlWidth === "auto" ? "sm:w-auto" : null)}>
            {describedControl}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
