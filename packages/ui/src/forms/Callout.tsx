import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import { HUE_GLYPH, hueForIcon } from "../theme/hues";
import { cn } from "../utils/selectStyles";

export type CalloutTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<CalloutTone, { box: string; icon: string }> = {
  neutral: { box: "bg-subtle text-ink-2", icon: "text-ink-3" },
  info: { box: "bg-sky-500/[0.07] text-ink-2", icon: "text-sky-600 dark:text-sky-300" },
  success: {
    box: "bg-emerald-500/[0.08] text-ink-2",
    icon: "text-emerald-600 dark:text-emerald-300",
  },
  warning: { box: "bg-amber-500/[0.09] text-ink-2", icon: "text-amber-600 dark:text-amber-300" },
  danger: { box: "bg-rose-500/[0.08] text-ink-2", icon: "text-rose-600 dark:text-rose-400" },
};

const DEFAULT_ICON: Record<CalloutTone, ReactNode> = {
  neutral: <Info />,
  info: <Info />,
  success: <CheckCircle2 />,
  warning: <AlertTriangle />,
  danger: <OctagonAlert />,
};

/**
 * 提示条：表单里「需要知道的事」——一次性密钥只显示一次、改了要重启、这个开关有风险……
 *
 * 只用同色系的淡底 + 彩色图标，正文保持中性色：整段文字都染成琥珀 / 红色时很难读，
 * 也会让一个普通提醒看起来像报错。以前各页面各写一套 `border-amber-200 bg-amber-50 …`，
 * 深色模式下的配色也各不相同，统一收敛到这里。
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
  const styles = TONE_CLASS[tone];
  const resolvedIcon = icon === false ? null : (icon ?? DEFAULT_ICON[tone]);
  // 中性提示条的底色保持灰；图标着色为「多彩」时图标按全站的「图标 → 色相」上色（锁是紫、
  // 信息是天蓝……），「单色」时保持中性。语义色调的图标颜色不变。
  const neutralHue = tone === "neutral" ? hueForIcon(resolvedIcon) : null;
  const iconClass = neutralHue ? cn(styles.icon, HUE_GLYPH[neutralHue]) : styles.icon;
  return (
    <div
      role={role}
      data-slot="callout"
      data-tone={tone}
      className={cn("flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm", styles.box, className)}
    >
      {resolvedIcon === null ? null : (
        <span
          aria-hidden="true"
          className={cn("mt-0.5 shrink-0 [&_svg.lucide]:size-[16px]", iconClass)}
        >
          {resolvedIcon}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-relaxed">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
      {actions ? <div className="shrink-0 self-center">{actions}</div> : null}
    </div>
  );
}
