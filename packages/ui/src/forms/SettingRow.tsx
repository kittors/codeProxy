import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/selectStyles";

/**
 * 一组设置：对齐 Satin `.sn-set-list` 视觉语言（实面底 + 1px 细线分隔）。
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
        "divide-y divide-[var(--sn-line)]",
        flat
          ? "[&>[data-slot=setting-row]]:px-0"
          : "overflow-hidden rounded-xl border border-[var(--sn-line)] bg-[var(--sn-raised)] [--cp-backdrop:var(--sn-raised)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type SettingControlWidth = "auto" | "sm" | "md" | "lg" | "full";

const CONTROL_COLUMN: Record<Exclude<SettingControlWidth, "full">, string> = {
  auto: "sm:grid-cols-[minmax(0,1fr)_auto]",
  sm: "sm:grid-cols-[minmax(0,1fr)_minmax(8rem,11rem)]",
  md: "sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]",
  lg: "sm:grid-cols-[minmax(0,1fr)_minmax(14rem,24rem)]",
};

/**
 * 设置行：左边说清「这是什么、改了会怎样」，右边是控件。
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
  meta?: ReactNode;
  badges?: ReactNode;
  control?: ReactNode;
  controlWidth?: SettingControlWidth;
  htmlFor?: string;
  modified?: boolean;
  onReset?: () => void;
  error?: ReactNode;
  highlighted?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const errorId = useId();
  const full = controlWidth === "full";
  const LabelTag = htmlFor ? "label" : "span";
  const hasDescription = Boolean(description || meta);
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
        highlighted ? "bg-[var(--sn-fill-active)]" : null,
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
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sn-accent)]"
              />
            ) : null}
            <LabelTag
              {...(htmlFor ? { htmlFor } : {})}
              className="text-sm font-medium text-[var(--sn-label)]"
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
                className="sn-btn sn-ghost sn-xs text-[var(--sn-label3)]"
              >
                <Icon name="rotate-ccw" size={12} />
                {t("common.revert", { defaultValue: "撤销" })}
              </button>
            ) : null}
          </div>
          {hasDescription ? (
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-[var(--sn-label3)]">
              {description}
              {meta ? (
                <code
                  className={cn(
                    "rounded-md bg-[var(--sn-fill-subtle)] px-1.5 py-px font-mono text-2xs text-[var(--sn-label3)]",
                    description ? "ml-1.5" : null,
                  )}
                >
                  {meta}
                </code>
              ) : null}
            </p>
          ) : null}
          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-xs leading-5 text-[var(--sn-danger)]">
              {error}
            </p>
          ) : null}
        </div>
        {control ? (
          <div
            className={cn(
              "min-w-0",
              full ? null : "sm:w-full sm:justify-self-end",
              controlWidth === "auto" ? "sm:w-auto" : null,
            )}
          >
            {describedControl}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
