// satin-ui/vue/charts：趋势面积图、分组柱状图、环形占比、3D 立体柱阵、迷你折线、3D 质感图标的 Vue 3 封装（按需子路径，不进主入口）。
//   import { AreaChart, BarChart, DonutChart, Chart3D, Sparkline, Icon3D } from "satin-ui/vue/charts";
import { createAreaChart, createBarChart, createDonutChart, createChart3D, createSparkline, createIcon3D } from "../src/data/charts.js";
import { wrap } from "./wrap.js";

export const AreaChart = /* @__PURE__ */ wrap(createAreaChart, { name: "SnAreaChart", props: ["labels", "series", "height", "unit", "legend", "area", "tipNote"], events: [], modelEvent: null });
export const BarChart = /* @__PURE__ */ wrap(createBarChart, { name: "SnBarChart", props: ["labels", "series", "height", "unit", "legend", "activeIndex"], events: ["select"], modelEvent: null });
export const DonutChart = /* @__PURE__ */ wrap(createDonutChart, { name: "SnDonutChart", props: ["items", "totalLabel", "unit", "activeIndex"], events: ["select"], modelEvent: null });
export const Chart3D = /* @__PURE__ */ wrap(createChart3D, { name: "SnChart3D", props: ["rows", "cols", "values", "height", "unit", "metricLabel", "rowColors", "interactive"], events: [], modelEvent: null });
export const Sparkline = /* @__PURE__ */ wrap(createSparkline, { name: "SnSparkline", props: ["values", "color", "width", "height", "fill"], events: [], modelEvent: null });
export const Icon3D = /* @__PURE__ */ wrap(createIcon3D, { name: "SnIcon3D", props: ["name", "tone", "size", "label"], events: [], modelEvent: null });
