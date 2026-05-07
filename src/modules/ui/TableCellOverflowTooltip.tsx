import { isValidElement, type ReactNode } from "react";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";

function normalizeTooltipText(parts: string[]) {
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || null;
}

function collectTextParts(node: ReactNode, parts: string[]) {
  if (node === null || node === undefined || typeof node === "boolean") return;

  if (typeof node === "string" || typeof node === "number") {
    parts.push(String(node));
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectTextParts(child, parts));
    return;
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    collectTextParts(props.children, parts);
  }
}

function containsManagedTooltip(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean") return false;

  if (Array.isArray(node)) return node.some(containsManagedTooltip);

  if (!isValidElement(node)) return false;

  if (node.type === HoverTooltip || node.type === OverflowTooltip) return true;

  const props = node.props as {
    children?: ReactNode;
    "data-tooltip-managed"?: unknown;
  };

  if (props["data-tooltip-managed"]) return true;

  return containsManagedTooltip(props.children);
}

export function extractTableCellTextContent(content: ReactNode) {
  const parts: string[] = [];
  collectTextParts(content, parts);
  return normalizeTooltipText(parts);
}

export function TableCellOverflowTooltip({
  children,
  className,
  tooltipContent,
}: {
  children: ReactNode;
  className?: string;
  tooltipContent?: string | null | false;
}) {
  const resolvedContent =
    tooltipContent === undefined ? extractTableCellTextContent(children) : tooltipContent;

  if (resolvedContent === false) return <>{children}</>;
  if (!resolvedContent?.trim()) return <>{children}</>;
  if (tooltipContent === undefined && containsManagedTooltip(children)) return <>{children}</>;

  return (
    <OverflowTooltip
      as="div"
      content={resolvedContent}
      data-table-cell-overflow
      data-vt-cell-content
      className={["block min-w-0 max-w-full truncate", className].filter(Boolean).join(" ")}
    >
      {children}
    </OverflowTooltip>
  );
}
