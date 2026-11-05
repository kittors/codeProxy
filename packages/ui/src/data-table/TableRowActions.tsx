import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../primitives/Button";
import { DropdownMenu } from "../primitives/DropdownMenu";
import { cn } from "../utils/selectStyles";

export type TableRowAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
  visible?: boolean;
  /** 悬停提示和可访问名称不同时用（例如「被覆盖，不能检测」）；默认就是 label。 */
  tooltip?: string;
};

/**
 * 行操作列的统一写法：表头和按钮组都居中，和 TableRowActions 的默认对齐一致。
 * 列宽固定（设计稿 160px）：去掉单元格左右内边距后正好放下四个图标按钮，
 * TableRowActions 因此最多平铺四个位置，多出来的收进「更多」，不会溢出列宽。
 * 页面别再给这一列写 text-right / text-left，也别自己拼按钮组：有框没框、方的圆的、
 * 对不齐表头，都是各页自己拼出来的。
 */
export const TABLE_ROW_ACTIONS_COLUMN = {
  width: "w-40 min-w-40 max-w-40",
  minWidthPx: 160,
  maxWidthPx: 160,
  resizable: false,
  overflowTooltip: false,
  headerClassName: "text-center",
  cellClassName: "whitespace-nowrap",
} as const;

export const TABLE_ROW_ACTIONS_STICKY_END_COLUMN = {
  ...TABLE_ROW_ACTIONS_COLUMN,
  lockOrder: "end",
  headerClassName: "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800",
  cellClassName: "whitespace-nowrap md:sticky md:z-30 md:bg-backdrop",
} as const;

const alignClassNames = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
} as const;

/** 固定宽度的操作列里最多放得下几个图标按钮（含「更多」）。 */
const MAX_INLINE_SLOTS = 4;

/**
 * 一行的操作：同一尺寸、同一形状的图标按钮（ghost 胶囊），危险操作只换成红色（ghost-danger），
 * 不换按钮形态；图标统一按 1rem 画，不管各页传进来的是 14、15 还是 16。
 */
export function TableRowActions({
  actions,
  maxInline = 3,
  moreLabel = "More actions",
  className,
  align = "center",
}: {
  actions: TableRowAction[];
  /** 最多平铺几个（默认三个）。列宽只放得下四个位置：传再大也最多平铺四个，放不下时平铺三个、其余进「更多」。 */
  maxInline?: number;
  moreLabel?: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const visibleActions = actions.filter((action) => action.visible !== false);
  const requested = Math.max(0, Math.floor(maxInline));
  const inlineLimit =
    visibleActions.length <= Math.min(requested, MAX_INLINE_SLOTS)
      ? visibleActions.length
      : Math.min(requested, MAX_INLINE_SLOTS - 1);
  const hasOverflow = visibleActions.length > inlineLimit;
  const inlineActions = hasOverflow ? visibleActions.slice(0, inlineLimit) : visibleActions;
  const overflowActions = hasOverflow ? visibleActions.slice(inlineLimit) : [];

  return (
    <div
      className={cn(
        "flex w-full flex-nowrap items-center gap-1 whitespace-nowrap",
        alignClassNames[align],
        className,
      )}
    >
      {inlineActions.map((action) => (
        <Button
          key={action.key}
          size="xs"
          variant={action.destructive ? "ghost-danger" : "ghost"}
          disabled={action.disabled}
          title={action.tooltip ?? action.label}
          aria-label={action.label}
          className={cn("[&_svg]:size-4", action.className)}
          onClick={action.onClick}
        >
          {action.icon}
        </Button>
      ))}

      {hasOverflow ? (
        <DropdownMenu.Root size="sm">
          <DropdownMenu.Trigger asChild>
            <Button size="xs" variant="ghost" title={moreLabel} aria-label={moreLabel} className="[&_svg]:size-4">
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align={align}>
              {overflowActions.map((action) => (
                <DropdownMenu.Item
                  key={action.key}
                  disabled={action.disabled}
                  tone={action.destructive ? "danger" : "default"}
                  onSelect={action.onClick}
                >
                  <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                    {action.icon}
                  </span>
                  <span>{action.label}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
    </div>
  );
}
