import type { ComponentProps, ReactNode } from "react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import { Icon } from "satin-ui/react";
import { Card, EChart, type Hue } from "@code-proxy/ui";

type SatinIconName = ComponentProps<typeof Icon>["name"];

/**
 * 仪表盘指标卡（对齐 Satin `.sn-panel` + `.sn-stat` + no-icon-box 规范）：
 * 克制裸矢量图标 + 标签 + 等宽数字主值 + 说明 + 底部趋势微图，去掉旧版花哨彩色底块。
 */
export function DashboardKpiCard({
  title,
  value,
  hint,
  icon,
  option,
}: {
  title: string;
  value: ReactNode;
  hint: ReactNode;
  icon: SatinIconName;
  /** 保留类型参数供调用方语义标记，视觉严格遵循 Satin 单色图标规范。 */
  hue?: Hue;
  option: ECBasicOption;
}) {
  return (
    <Card className="h-full" bodyClassName="mt-0 flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-sn-label3">{title}</span>
        <Icon name={icon} size={15} className="shrink-0 text-sn-label3" />
      </div>
      <div className="mt-2.5 text-2xl leading-none font-semibold tracking-tight text-sn-label tabular-nums">
        {value}
      </div>
      <p className="mt-2 text-xs text-sn-label3 tabular-nums">{hint}</p>
      <div className="mt-auto pt-3">
        <EChart option={option} className="h-10" overflowVisible />
      </div>
    </Card>
  );
}
