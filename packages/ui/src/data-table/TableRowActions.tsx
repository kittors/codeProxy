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
  /** false：整列都用不了（没有权限、页面没配这个动作），不占位置。 */
  visible?: boolean;
  /**
   * 只是这一行用不了（行的状态，例如系统租户不能编辑、没有重置记录）：位置留空，
   * 同一个动作在每一行都落在同一处。以前直接不画，剩下的按钮整组居中，租户页「系统管理」
   * 那行的查看按钮就比别的行偏了一截。空位也算一个位置：动作多到要收进「更多」时，留空位
   * 可能把每一行的常用按钮挤进菜单，那种只有少数行才有的动作还是用 visible。
   */
  unavailable?: boolean;
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
  // 位置按「这一列有哪些动作」排，unavailable 的也占一个位置，所以每行的布局一样。
  const slotActions = actions.filter((action) => action.visible !== false);
  const requested = Math.max(0, Math.floor(maxInline));
  const inlineLimit =
    slotActions.length <= Math.min(requested, MAX_INLINE_SLOTS)
      ? slotActions.length
      : Math.min(requested, MAX_INLINE_SLOTS - 1);
  const hasOverflow = slotActions.length > inlineLimit;
  const inlineActions = hasOverflow ? slotActions.slice(0, inlineLimit) : slotActions;
  const overflowActions = hasOverflow
    ? slotActions.slice(inlineLimit).filter((action) => !action.unavailable)
    : [];

  return (
    <div
      className={cn(
        "flex w-full flex-nowrap items-center gap-1 whitespace-nowrap",
        alignClassNames[align],
        className,
      )}
    >
      {inlineActions.map((action) =>
        action.unavailable ? (
          <EmptySlot key={action.key} />
        ) : (
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
        ),
      )}

      {hasOverflow && overflowActions.length === 0 ? <EmptySlot /> : null}
      {overflowActions.length > 0 ? (
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

/** 和 xs 图标按钮一样大的空位：看不见、点不到，读屏也跳过。 */
function EmptySlot() {
  return <span aria-hidden="true" className="inline-block h-7 w-7 shrink-0" />;
}
