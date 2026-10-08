import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import { Card, DialogIcon, EChart, type Hue } from "@code-proxy/ui";

/**
 * 仪表盘上的一格指标：名称、数值、说明、底部一条迷你趋势线。每格是一张独立的卡片
 * （见 DashboardPage），数值本身保持墨色。
 *
 * 跟随「外观」：多彩风格下每格有一个身份色（chartTheme 的 metric），标题前的小图标块与底部
 * 趋势线同色，和系统监控、监控中心、账号详情用的是同一组色系；简约风格下标题前是线性图标、
 * 趋势线用强调色，只有失败请求用错误红。
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
    <Card className="h-full" bodyClassName="mt-0 flex h-full min-w-0 flex-col">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Icon size={16} className="shrink-0 text-ink-3 icon-hue:hidden" aria-hidden="true" />
        <span className="hidden icon-hue:contents">
          <DialogIcon tone={hue} size="xs">
            <Icon />
          </DialogIcon>
        </span>
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
