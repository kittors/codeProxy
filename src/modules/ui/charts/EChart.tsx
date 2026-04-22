import { Suspense, lazy } from "react";
import type { EChartProps, EChartEvents } from "@/modules/ui/charts/EChartRenderer";

const LazyEChartRenderer = lazy(() =>
  import("@/modules/ui/charts/EChartRenderer").then((mod) => ({
    default: mod.EChartRenderer,
  })),
);

export type { EChartEvents };

export function EChart(props: EChartProps) {
  const overflowClass = props.overflowVisible ? "overflow-visible" : "overflow-hidden";

  return (
    <Suspense
      fallback={
        <div
          className={["relative w-full min-w-0", overflowClass, props.className]
            .filter(Boolean)
            .join(" ")}
        />
      }
    >
      <LazyEChartRenderer {...props} />
    </Suspense>
  );
}
