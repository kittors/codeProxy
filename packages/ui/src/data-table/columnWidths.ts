/**
 * 语义列宽令牌。
 *
 * 各页此前手写 Tailwind 宽度（`w-44` / `w-[220px]` …），同类内容在不同表里
 * 宽度不一：开关列有的 96px 有的 176px，时间戳有的 144px 有的 208px。更常见的
 * 问题是列窄于表头文字本身，"累计重置次数" 这类 6 字表头会被直接截掉尾字。
 *
 * 取值口径（按线上 DataTable 实测得出，不要凭 padding 推算）：
 *
 *     列宽 = max(表头文字, 内容) + 74px
 *
 * 这 74px 是实测的表头固定开销：单元格 padding 32 + 拖拽手柄 20 + resize 手柄
 * 16 + 间距 6。表头文字按 12px/中文字估算，以中文为准——英文文案普遍更长，
 * 超出部分靠表头 title 兜底，不为此把本就需要横向滚动的表格再撑宽一档。
 * 多个令牌值相同是正常的——它们按语义分类，将来某一类需要整体调整时只改一处。
 *
 * 用法：`width: COLUMN_WIDTH.timestamp`。内容确实超出令牌刻度时（复合单元格、
 * 长描述）直接写具体值并在该列注明原因，不要为了套令牌牺牲可读性。
 */
export const COLUMN_WIDTH = {
  /** 56px — 复选框列，无表头文字，只需容纳 16px 勾选框。 */
  checkbox: "w-14 min-w-14",
  /** 112px — 开关、单个图标按钮。表头 2-3 字（启用 / Enabled）。 */
  toggle: "w-28 min-w-28",
  /** 112px — 短数值：计数、百分比。表头 2-3 字（成功 / Success）。 */
  numeric: "w-28 min-w-28",
  /** 112px — 单个短徽章：类型、模式、状态。 */
  badge: "w-28 min-w-28",
  /** 128px — 短标识、枚举文本、金额（当日消费 / RPM）。 */
  compact: "w-32 min-w-32",
  /** 144px — 长数值：token 数、金额、重置次数。表头 4-6 字（累计消费）。 */
  numericWide: "w-36 min-w-36",
  /** 144px — 带进度条或状态条的指标列（成功率、连通性）。 */
  metric: "w-36 min-w-36",
  /** 160px — 日期时间戳（2026/8/6 10:41:47）。 */
  timestamp: "w-40 min-w-40",
  /** 160px — 徽章 + 副标签堆叠（类型 + 套餐、协议 + 地址）。 */
  badgeStacked: "w-40 min-w-40",
  /** 176px — 徽章组：多标签、多角色、权限集合。 */
  badgeGroup: "w-44 min-w-44",
  /** 208px — 常规名称、单行标题。 */
  name: "w-52 min-w-52",
  /** 288px — 名称 + 副标题（邮箱、ID、徽章）的双行单元格。 */
  nameStacked: "w-72 min-w-72",
  /** 320px — 复合内容：chip 网格、多列指标、长描述。 */
  composite: "w-80 min-w-80",
} as const;

export type ColumnWidthToken = keyof typeof COLUMN_WIDTH;
