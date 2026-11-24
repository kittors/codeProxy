import type { ReactNode } from "react";
import { Icon } from "satin-ui/react";
import { HUE_GLYPH, hueForIcon } from "../theme/hues";
import { cn } from "../utils/selectStyles";

export type CalloutTone = "neutral" | "info" | "success" | "warning" | "danger";

const BANNER_TONE_CLASS: Record<CalloutTone, string> = {
  neutral: "",
  info: "sn-info",
  success: "sn-ok",
  warning: "sn-warn",
  danger: "sn-bad",
};

const ICON_TONE_CLASS: Record<CalloutTone, string> = {
  neutral: "text-[var(--sn-label3)]",
  info: "text-[var(--sn-label)]",
  success: "text-[var(--sn-success)]",
  warning: "text-[var(--sn-warning)]",
  danger: "text-[var(--sn-danger)]",
};

const DEFAULT_ICON_NAME: Record<CalloutTone, string> = {
  neutral: "info",
  info: "info",
  success: "circle-check",
  warning: "triangle-alert",
  danger: "circle-alert",
};

/**
 * 基于 Satin `.sn-banner` 的提示条：
 * 中性正文搭配克制的淡语义底与 Solar Icons 状态图标，深浅模式完全走 Satin 令牌。
 */
export function Callout({
  tone = "info",
  title,
  icon,
  actions,
  children,
  className,
  role,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  icon?: ReactNode | false;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** 动态出现的错误用 alert，让读屏立即播报；静态说明不需要。 */
  role?: "alert" | "status";
}) {
  const resolvedIcon =
    icon === false ? null : (icon ?? <Icon name={DEFAULT_ICON_NAME[tone]} size={16} />);
  const neutralHue = tone === "neutral" && icon !== undefined ? hueForIcon(resolvedIcon) : null;
  const iconClass = neutralHue ? cn(ICON_TONE_CLASS[tone], HUE_GLYPH[neutralHue]) : ICON_TONE_CLASS[tone];

  return (
    <div
      role={role}
      data-slot="callout"
      data-tone={tone}
      className={cn(
        "sn-banner !items-start !px-3.5 !py-3",
        BANNER_TONE_CLASS[tone],
        className,
      )}
    >
      {resolvedIcon === null ? null : (
        <span aria-hidden="true" className={cn("mt-0.5 shrink-0 [&_svg]:size-4", iconClass)}>
          {resolvedIcon}
        </span>
      )}
      <div className="sn-msg !py-0 leading-relaxed text-[var(--sn-label2)]">
        {title ? <p className="font-medium text-[var(--sn-label)]">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
      {actions ? <div className="shrink-0 self-center">{actions}</div> : null}
    </div>
  );
}
