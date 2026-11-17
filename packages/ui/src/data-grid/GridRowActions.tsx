import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { DropdownMenu } from "../primitives/DropdownMenu";
import { cn } from "../utils/selectStyles";
import type { DataGridColumn } from "./types";

export type GridRowAction = {
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
   * 同一个动作在每一行都落在同一处——不留空位的话，剩下的按钮整组居中，
   * 租户页「系统管理」那行的查看按钮就比别的行偏了一截。动作多到要收进「更多」时，
   * 空位也算一个位置，可能把每一行的常用按钮挤进菜单；那种只有少数行才有的动作用 visible。
   */
  unavailable?: boolean;
  /** 悬停提示和可访问名称不同时用（例如「被覆盖，不能检测」）；默认就是 label。 */
  tooltip?: string;
};

/** 固定宽度的操作列里最多放得下几个图标按钮（含「更多」）。 */
const MAX_INLINE_SLOTS = 4;
/** xs 图标按钮 28px、按钮间距 4px、单元格左右内边距合计 24px，再留 8px 余量（设计像素）。 */
const SLOT_WIDTH = 28;
const SLOT_GAP = 4;
const CELL_OVERHEAD = 32;
/** 只有一两个按钮时也要放得下表头文字（俄语「Действия」最长）。 */
const MIN_ACTIONS_WIDTH = 88;

/**
 * 行操作列：冻结在右侧、居中、固定宽度、不能拖宽 / 隐藏 / 换位置，按钮组用 GridRowActions。
 * slots 是这一列最多同时显示几个按钮（含「更多」），宽度刚好放下它们；默认四个（160px）。
 * 页面别自己拼按钮组，也别给这一列写对齐：各页自己拼出来的有框没框、方的圆的、对不齐表头。
 */
export function gridRowActionsColumn(slots: number = MAX_INLINE_SLOTS) {
  const count = Math.max(1, Math.min(MAX_INLINE_SLOTS, Math.floor(slots)));
  const raw = count * SLOT_WIDTH + (count - 1) * SLOT_GAP + CELL_OVERHEAD;
  const width = count === MAX_INLINE_SLOTS ? 160 : Math.max(MIN_ACTIONS_WIDTH, raw);
  return {
    pin: "end",
    align: "center",
    width,
    minWidth: width,
    maxWidth: width,
    resizable: false,
    hideable: false,
    reorderable: false,
    overflowTooltip: false,
  } as const satisfies Partial<DataGridColumn<unknown>>;
}

export const GRID_ROW_ACTIONS_COLUMN = gridRowActionsColumn();

const alignClassNames = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
} as const;

/**
 * 一行的操作：同一尺寸、同一形状的图标按钮（ghost 胶囊），危险操作只换成红色（ghost-danger），
 * 不换按钮形态；图标统一按 1rem 画，不管各页传进来的是 14、15 还是 16。
 */
export function GridRowActions({
  actions,
  maxInline = 3,
  moreLabel,
  className,
  align = "center",
}: {
  actions: GridRowAction[];
  /** 最多平铺几个（默认三个）。列宽最多放得下四个位置：放不下时平铺三个、其余进「更多」。 */
  maxInline?: number;
  moreLabel?: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { t } = useTranslation();
  const more = moreLabel ?? t("data_grid.more_row_actions");
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
      data-grid-stop=""
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
            <Button
              size="xs"
              variant="ghost"
              title={more}
              aria-label={more}
              className="[&_svg]:size-4"
            >
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
