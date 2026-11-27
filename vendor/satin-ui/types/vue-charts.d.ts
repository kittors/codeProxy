// satin-ui/vue/charts
import type { DefineComponent } from "vue";
import type { AreaChartOptions, BarChartOptions, DonutChartOptions, Chart3DOptions, SparklineOptions, Icon3DOptions } from "./heavy";

export const AreaChart: DefineComponent<AreaChartOptions>;
export const BarChart: DefineComponent<Omit<BarChartOptions, "onSelect">>;
export const DonutChart: DefineComponent<Omit<DonutChartOptions, "onSelect">>;
export const Chart3D: DefineComponent<Chart3DOptions>;
export const Sparkline: DefineComponent<SparklineOptions>;
export const Icon3D: DefineComponent<Icon3DOptions>;
