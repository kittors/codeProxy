import type { ECBasicOption } from "echarts/types/dist/shared";
import type { MonitorFlowGraph, MonitorFlowLayer, MonitorFlowNode } from "@code-proxy/api-client";
import { formatMonitorCompact } from "../model/monitorFormat";
import { monitorPalette, monitorTooltip, tooltipHtml } from "./chartBase";

export interface SankeyLabels {
  other: string;
  unknown: string;
  unnamed: string;
  requests: string;
  tokens: string;
}

export function flowLayerColor(layer: MonitorFlowLayer, isDark: boolean): string {
  const palette = monitorPalette(isDark);
  if (layer === "consumer") return palette.metric.requests;
  if (layer === "model") return palette.metric.tokens;
  return palette.ok;
}

/** 节点显示名：「其他」「未知」是后端折叠出来的节点，标签为空。 */
export function flowNodeLabel(node: MonitorFlowNode, labels: SankeyLabels): string {
  const key = node.id.slice(node.id.indexOf(":") + 1);
  if (key === "__other__") return labels.other;
  if (key === "__unknown__") return labels.unknown;
  if (node.label) return node.label;
  return node.layer === "consumer" ? labels.unnamed : key;
}

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * 流量流向：门户用户 → 模型 → 渠道。三层各用一个身份色（请求蓝、Token 紫、渠道绿），
 * 连线从来源色渐变到去向色；每层只保留流量最大的几个，其余并进「其他」（后端已折叠）。
 */
export function createSankeyOption(
  flows: MonitorFlowGraph,
  isDark: boolean,
  labels: SankeyLabels,
  /** 窄屏：中间一层（模型）的文字会和两侧挤在一起，只留在悬停提示里。 */
  compact = false,
): ECBasicOption {
  const palette = monitorPalette(isDark);
  const byId = new Map(flows.nodes.map((node) => [node.id, node]));
  const labelOf = (id: string) => {
    const node = byId.get(id);
    return node ? flowNodeLabel(node, labels) : id;
  };

  return {
    animationDuration: 600,
    animationDurationUpdate: 400,
    tooltip: {
      ...monitorTooltip(isDark),
      trigger: "item",
      formatter: (params: unknown) => {
        const item = params as {
          dataType?: string;
          name?: string;
          value?: number;
          data?: { source?: string; target?: string; value?: number; tokens?: number };
        };
        if (item.dataType === "edge" && item.data?.source && item.data.target) {
          return tooltipHtml(`${labelOf(item.data.source)} → ${labelOf(item.data.target)}`, [
            { label: labels.requests, value: formatMonitorCompact(item.data.value ?? 0) },
            {
              label: labels.tokens,
              value: formatMonitorCompact(item.data.tokens ?? 0),
              muted: true,
            },
          ]);
        }
        return tooltipHtml(labelOf(item.name ?? ""), [
          { label: labels.requests, value: formatMonitorCompact(item.value ?? 0) },
        ]);
      },
    },
    series: [
      {
        id: "flows",
        type: "sankey",
        left: 4,
        right: 4,
        top: 8,
        bottom: 8,
        nodeWidth: 10,
        nodeGap: 10,
        nodeAlign: "justify",
        layoutIterations: 32,
        draggable: false,
        emphasis: { focus: "adjacency" },
        label: {
          color: palette.ink2,
          fontSize: 12,
          formatter: (params: { name: string }) => truncate(labelOf(params.name), 22),
        },
        // 同一层相邻的小节点（零星的模型、「其他」）标签会叠在一起：按节点面积保留大的，
        // 被藏起来的小节点悬停时提示框照样有名字。
        labelLayout: { hideOverlap: true },
        lineStyle: { color: "gradient", opacity: isDark ? 0.32 : 0.24, curveness: 0.5 },
        levels: compact ? [{ depth: 1, label: { show: false } }] : undefined,
        itemStyle: { borderWidth: 0, borderRadius: 2 },
        data: flows.nodes.map((node) => ({
          name: node.id,
          itemStyle: { color: flowLayerColor(node.layer, isDark) },
          // 最后一层的标签放到节点左边，免得长渠道名伸出画布被裁掉。
          label: node.layer === "channel" ? { position: "left" } : { position: "right" },
        })),
        links: flows.links.map((link) => ({
          source: link.source,
          target: link.target,
          value: link.requests,
          tokens: link.tokens,
        })),
      },
    ],
  };
}
