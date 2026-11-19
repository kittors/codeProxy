import { isValidElement, type ReactNode } from "react";
import { HoverTooltip, OverflowTooltip } from "../overlays/Tooltip";
import { GridCellTooltip } from "./GridCellTooltip";
import type { DataGridColumn } from "./types";

/**
 * 单元格自动「全文提示」的取值：从单元格返回的内容里收集文字。
 * 只看元素自己写出来的 children，自定义组件内部渲染的文字取不到——那种单元格自己管提示。
 * 内容里已经有提示（GridCellTooltip、HoverTooltip、OverflowTooltip，或带 data-tooltip-managed）
 * 时不再套一层：同一处叠两个提示，底部会出现两个一样的气泡（旧请求日志的模型名就是这样）。
 */

function collectText(node: ReactNode, parts: string[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    parts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, parts);
    return;
  }
  if (isValidElement(node)) {
    collectText((node.props as { children?: ReactNode }).children, parts);
  }
}

export function extractCellText(node: ReactNode): string | null {
  const parts: string[] = [];
  collectText(node, parts);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || null;
}

export function containsManagedTooltip(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean") return false;
  if (Array.isArray(node)) return node.some(containsManagedTooltip);
  if (!isValidElement(node)) return false;
  if (
    node.type === GridCellTooltip ||
    node.type === HoverTooltip ||
    node.type === OverflowTooltip
  ) {
    return true;
  }
  const props = node.props as { children?: ReactNode; "data-tooltip-managed"?: unknown };
  if (props["data-tooltip-managed"]) return true;
  return containsManagedTooltip(props.children);
}

/** 这一格截断时提示什么；null 表示不加提示。 */
export function resolveCellTooltip<T>(
  column: DataGridColumn<T>,
  row: T,
  content: ReactNode,
): string | null {
  const setting = column.overflowTooltip;
  if (setting === false) return null;
  if (typeof setting === "function") {
    const text = setting(row);
    return text && text.trim() ? text : null;
  }
  if (typeof content === "string" || typeof content === "number") {
    const text = String(content).trim();
    return text || null;
  }
  if (containsManagedTooltip(content)) return null;
  return extractCellText(content);
}
