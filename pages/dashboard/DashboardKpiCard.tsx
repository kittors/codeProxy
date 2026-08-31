import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import { Card, EChart, surface } from "@code-proxy/ui";

const PANEL_SURFACE = surface({ tone: "panel", radius: "2xl" });

export function DashboardKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  option,
  accent,
}: {
  title: string;
  value: ReactNode;
  hint: ReactNode;
  icon: typeof Activity;
  option: ECBasicOption;
  accent: {
    iconWrap: string;
    iconColor: string;
  };
}) {
  return (
    <Card
      className={`${PANEL_SURFACE} h-full`}
      bodyClassName="mt-0 flex h-full flex-col"
      padding="compact"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${accent.iconWrap}`}
        >
          <Icon size={16} className={accent.iconColor} />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        <div className="mt-2 text-3xl font-semibold leading-none tracking-tight text-slate-950 dark:text-white">
          {value}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-white/45">{hint}</p>
      </div>
      <div className="mt-auto pt-3">
        <EChart option={option} className="h-10" overflowVisible />
      </div>
    </Card>
  );
}
