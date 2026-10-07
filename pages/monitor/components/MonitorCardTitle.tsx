import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** 卡片标题：线性图标 + 标题，可带一个右侧的小注（比如「最近 60 分钟」）。 */
export function MonitorCardTitle({
  icon: Icon,
  label,
  note,
}: {
  icon: LucideIcon;
  label: string;
  note?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex items-center gap-2">
        <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
        {label}
      </span>
      {note ? <span className="text-xs font-normal text-ink-3">{note}</span> : null}
    </span>
  );
}

/** 模块级的「这里没有数据 / 需要升级后端」提示，比 EmptyState 更矮，放进卡片里不撑高度。 */
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
      <span className="grid size-9 place-items-center rounded-full bg-hover text-ink-3">
        <Icon size={18} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {description ? <p className="max-w-sm text-xs text-ink-3">{description}</p> : null}
    </div>
  );
}
