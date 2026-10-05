import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import { EChart } from "@code-proxy/ui";

/**
 * 仪表盘上的一格指标：名称、数值、说明、底部一条迷你趋势线。
 *
 * 不再各自是一张带彩色圆底图标的卡片——六格放进同一张卡片里、用细线分隔（见
 * DashboardPage），图标退成标题前的小号灰色图标。颜色只留给真正的状态（失败请求）。
 */
export function DashboardKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  option,
}: {
  title: string;
  value: ReactNode;
  hint: ReactNode;
  icon: typeof Activity;
  option: ECBasicOption;
}) {
  return (
    <div className="flex min-w-0 flex-col border-r border-b border-line px-5 pt-4 pb-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
        <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <div className="mt-2 text-3xl leading-none font-semibold tracking-tight text-ink">
        {value}
      </div>
      <p className="mt-2 text-xs text-ink-3">{hint}</p>
      <div className="mt-auto pt-3">
        <EChart option={option} className="h-10" overflowVisible />
      </div>
    </div>
  );
}
