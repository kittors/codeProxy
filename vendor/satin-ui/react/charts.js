"use client"; // Next.js 等 React 服务端组件环境：Canvas 绘图与交互是客户端组件
// satin-ui/react/charts：趋势面积图、分组柱状图、环形占比、3D 立体柱阵、迷你折线、3D 质感图标的 React 封装（按需子路径，不进主入口）。
//   import { AreaChart, BarChart, DonutChart, Chart3D, Sparkline, Icon3D } from "satin-ui/react/charts";
import { createAreaChart, createBarChart, createDonutChart, createChart3D, createSparkline, createIcon3D } from "../src/charts.js";
import { wrap } from "./wrap.js";

export const AreaChart = /* @__PURE__ */ wrap(createAreaChart, { events: [], displayName: "AreaChart" });
export const BarChart = /* @__PURE__ */ wrap(createBarChart, { events: ["select"], displayName: "BarChart" });
export const DonutChart = /* @__PURE__ */ wrap(createDonutChart, { events: ["select"], displayName: "DonutChart" });
export const Chart3D = /* @__PURE__ */ wrap(createChart3D, { events: [], displayName: "Chart3D" });
export const Sparkline = /* @__PURE__ */ wrap(createSparkline, { events: [], displayName: "Sparkline" });
export const Icon3D = /* @__PURE__ */ wrap(createIcon3D, { events: [], displayName: "Icon3D" });
