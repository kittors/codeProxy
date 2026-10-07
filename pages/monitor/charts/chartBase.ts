import { chartAxisStyle, chartPalette, chartTooltipStyle } from "@code-proxy/ui";

/**
 * 监控中心图表的公共部分：提示框与坐标轴沿用全局 chartTheme（深色实心气泡、只留最浅的横向网格），
 * 这里只补监控页共用的提示框排版。
 */

export function monitorTooltip(isDark: boolean) {
  const style = chartTooltipStyle(isDark);
  return {
    ...style,
    renderMode: "html" as const,
    appendToBody: true,
    confine: true,
    extraCssText: `${style.extraCssText} z-index: 10000; min-width: 168px;`,
  };
}

export function monitorAxis(isDark: boolean) {
  return chartAxisStyle(isDark);
}

export function monitorPalette(isDark: boolean) {
  return chartPalette(isDark);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 提示框是 HTML 字符串；模型名、渠道名、用户名都来自数据，必须转义。 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export interface TooltipRow {
  color?: string;
  label: string;
  value: string;
  /** 次要行（合计、说明）用浅一档的文字。 */
  muted?: boolean;
}

export function tooltipHtml(title: string, rows: TooltipRow[]): string {
  const body = rows
    .map((row) => {
      const dot = row.color
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${row.color};margin-right:6px;flex:none"></span>`
        : "";
      const opacity = row.muted ? "opacity:0.7;" : "";
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;${opacity}"><span style="display:flex;align-items:center;min-width:0">${dot}${escapeHtml(row.label)}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${escapeHtml(row.value)}</span></div>`;
    })
    .join("");
  return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>${body}`;
}

/** 系列在 echarts 回调里的取值（axis 触发时是数组，item 触发时是单个对象）。 */
export function firstParam(params: unknown): { dataIndex: number } | null {
  const first = Array.isArray(params) ? params[0] : params;
  if (first && typeof first === "object" && "dataIndex" in first) {
    return first as { dataIndex: number };
  }
  return null;
}

/** 十六进制颜色加透明度（#rrggbb → #rrggbbaa）。 */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${byte}`;
}
