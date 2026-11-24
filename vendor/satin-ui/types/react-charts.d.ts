// satin-ui/react/charts
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { AreaChartOptions, BarChartOptions, DonutChartOptions, Chart3DOptions, SparklineOptions, Icon3DOptions } from "./heavy";
type Base = { className?: string; style?: React.CSSProperties; id?: string };

export const AreaChart: React.ForwardRefExoticComponent<Base & AreaChartOptions & React.RefAttributes<SatinInstance & { replay(): void }>>;
export const BarChart: React.ForwardRefExoticComponent<Base & BarChartOptions & React.RefAttributes<SatinInstance & { replay(): void }>>;
export const DonutChart: React.ForwardRefExoticComponent<Base & DonutChartOptions & React.RefAttributes<SatinInstance & { replay(): void }>>;
export const Chart3D: React.ForwardRefExoticComponent<Base & Chart3DOptions & React.RefAttributes<SatinInstance & { setView(name: "iso" | "top" | "front"): void; replay(): void }>>;
export const Sparkline: React.ForwardRefExoticComponent<Base & SparklineOptions & React.RefAttributes<SatinInstance>>;
export const Icon3D: React.ForwardRefExoticComponent<Base & Icon3DOptions & React.RefAttributes<SatinInstance>>;
