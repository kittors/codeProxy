import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import { Card, EChart } from "@code-proxy/ui";

/**
 * 仪表盘上的一格指标：名称、数值、说明、底部一条迷你趋势线。
 *
 * 每格是一张独立的卡片（见 DashboardPage）。标题前是线性图标，不垫彩色图标块；趋势线用
 * 强调色，失败请求用错误红——颜色只用来说明「这一格需要留意」，而不是给每格分一个身份色。
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
    <Card className="h-full" bodyClassName="mt-0 flex h-full min-w-0 flex-col">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
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
    </Card>
  );
}
