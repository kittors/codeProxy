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
};

export const TABLE_ROW_ACTIONS_COLUMN = {
  width: "w-40 min-w-40 max-w-40",
  minWidthPx: 160,
  maxWidthPx: 160,
  resizable: false,
  overflowTooltip: false,
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

export function TableRowActions({
  actions,
  maxInline = 3,
  moreLabel = "More actions",
  className,
  align = "center",
}: {
  actions: TableRowAction[];
  maxInline?: number;
  moreLabel?: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const visibleActions = actions.filter((action) => action.visible !== false);
  const inlineLimit = Math.max(0, Math.floor(maxInline));
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
          title={action.label}
          aria-label={action.label}
          className={action.className}
          onClick={action.onClick}
        >
          {action.icon}
        </Button>
      ))}

      {hasOverflow ? (
        <DropdownMenu.Root size="sm">
          <DropdownMenu.Trigger asChild>
            <Button size="xs" variant="ghost" title={moreLabel} aria-label={moreLabel}>
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
