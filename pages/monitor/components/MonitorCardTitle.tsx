import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HUE_GLYPH, dialogToneClass, iconHueClass, type Hue } from "@code-proxy/ui";

/**
 * 卡片标题：线性图标 + 标题，可带一个右侧的小注（比如「最近 60 分钟」）。
 *
 * 图标着色为多彩时，图标默认按全站「图标 → 色相」注册表着色（同一个图标到哪儿都是同一种
 * 颜色）；卡片讲的是某个指标时传 `hue`，用该指标的身份色（耗时靛蓝、实时流量请求蓝……），
 * 和卡片里的图表对得上。单色时是中性的弱化墨色。
 */
export function MonitorCardTitle({
  icon: Icon,
  hue,
  label,
  note,
}: {
  icon: LucideIcon;
  hue?: Hue;
  label: string;
  note?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex items-center gap-2">
        <Icon
          size={16}
          className={`shrink-0 text-ink-3 ${hue ? HUE_GLYPH[hue] : iconHueClass(Icon)}`}
          aria-hidden="true"
        />
        {label}
      </span>
      {note ? <span className="text-xs font-normal text-ink-3">{note}</span> : null}
    </span>
  );
}

/**
 * 模块级的「这里没有数据 / 需要升级后端」提示，比 EmptyState 更矮，放进卡片里不撑高度。
 * 图标圆块与 EmptyState 一样按图标取色相（图标着色为单色时是中性淡底）。
 */
export function MonitorInlineNotice({
  icon: Icon,
  title,
  description,
  className = "py-10",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      <span
        className={`grid size-9 place-items-center rounded-full ${dialogToneClass("auto", <Icon />)}`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {description ? <p className="max-w-sm text-xs text-ink-3">{description}</p> : null}
    </div>
  );
}
