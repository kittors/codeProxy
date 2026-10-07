import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import { DialogIcon, EChart, type Hue } from "@code-proxy/ui";

/**
 * 仪表盘上的一格指标：名称、数值、说明、底部一条迷你趋势线。
 *
 * 六格放进同一张卡片里、用细线分隔（见 DashboardPage）。每格有一个身份色（chartTheme 的
 * metric）：标题前的小图标块与底部趋势线同色，和系统监控、监控中心、账号详情用的是同一组色系；
 * 数值本身保持墨色。
 */
export function DashboardKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  hue,
  option,
}: {
  title: string;
  value: ReactNode;
  hint: ReactNode;
  icon: typeof Activity;
  /** 图标块的色相，与趋势线的身份色一致（请求蓝、成功绿、Token 紫、费用琥珀、失败红、缓存青）。 */
  hue: Hue;
  option: ECBasicOption;
}) {
  return (
    <div className="flex min-w-0 flex-col border-r border-b border-line px-5 pt-4 pb-3">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <DialogIcon tone={hue} size="xs">
          <Icon />
        </DialogIcon>
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
