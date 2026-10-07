import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn, floatingPanelSurface } from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";

const DropdownMenuSizeContext = createContext<ControlSize>("default");

export interface DropdownMenuRootProps extends ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Root
> {
  /** Shared visual size for menu content and items. */
  size?: ControlSize;
}

function Root({ size = "default", children, ...props }: DropdownMenuRootProps) {
  return (
    <DropdownMenuSizeContext.Provider value={size}>
      <DropdownMenuPrimitive.Root {...props}>{children}</DropdownMenuPrimitive.Root>
    </DropdownMenuSizeContext.Provider>
  );
}

const Trigger = DropdownMenuPrimitive.Trigger;
const Portal = DropdownMenuPrimitive.Portal;
const Group = DropdownMenuPrimitive.Group;
const ItemIndicator = DropdownMenuPrimitive.ItemIndicator;
const Sub = DropdownMenuPrimitive.Sub;
const RadioGroup = DropdownMenuPrimitive.RadioGroup;

const CONTENT_CLASS_BY_SIZE: Record<ControlSize, string> = {
  sm: "min-w-28 p-1",
  default: "min-w-36 p-1.5",
  lg: "min-w-40 p-2",
};

const ITEM_CLASS_BY_SIZE: Record<ControlSize, string> = {
  sm: "gap-2 rounded-md px-2 py-1.5 text-xs",
  default: "gap-2.5 rounded-lg px-2.5 py-2 text-sm",
  lg: "gap-2.5 rounded-lg px-3 py-2.5 text-sm",
};

/**
 * 菜单项：常规字重、墨色文字，图标退一档到 ink-2；键盘高亮和鼠标悬停共用同一层浅灰。
 * 危险操作由调用方追加文字颜色（如 text-rose-600）覆盖。
 *
 * 进出动画不在这里写：floatingPanelSurface 带的 `code-proxy-floating-surface` 会按
 * Radix 暴露的 data-state / data-side 播放（utils/FloatingPanel.css），
 * 下拉、菜单、侧栏浮层共用同一套曲线。
 */
const MENU_ITEM_BASE =
  "flex w-full cursor-default select-none items-center outline-none transition-colors duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:shrink-0";

/**
 * 危险操作（删除、退出登录）用 `tone="danger"`：文字与图标一起变红，高亮底换成淡红。
 * 两种色调互斥地拼进类名，而不是让调用方再追加一个 text-rose-* 去覆盖——
 * 同属性工具类谁覆盖谁取决于 Tailwind 的输出顺序，靠不住。
 */
const MENU_ITEM_TONE = {
  default: "text-ink focus:bg-hover data-[highlighted]:bg-hover [&>svg]:text-ink-2",
  danger:
    "text-rose-600 focus:bg-rose-500/10 data-[highlighted]:bg-rose-500/10 dark:text-rose-400",
} as const;

type MenuItemTone = keyof typeof MENU_ITEM_TONE;

const MENU_ITEM_CLASS = `${MENU_ITEM_BASE} ${MENU_ITEM_TONE.default}`;

const Content = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  const size = useContext(DropdownMenuSizeContext);
  return (
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[9999] overflow-hidden outline-none",
        floatingPanelSurface,
        CONTENT_CLASS_BY_SIZE[size],
        className,
      )}
      {...props}
    />
  );
});

const Item = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { tone?: MenuItemTone }
>(function DropdownMenuItem({ className, tone = "default", ...props }, ref) {
  const size = useContext(DropdownMenuSizeContext);
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(MENU_ITEM_BASE, MENU_ITEM_TONE[tone], ITEM_CLASS_BY_SIZE[size], className)}
      {...props}
    />
  );
});

const Separator = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("mx-1 my-1.5 h-px bg-line", className)}
      {...props}
    />
  );
});

const SubTrigger = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(function DropdownMenuSubTrigger({ className, ...props }, ref) {
  const size = useContext(DropdownMenuSizeContext);
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        cn(MENU_ITEM_CLASS, "data-[state=open]:bg-hover"),
        ITEM_CLASS_BY_SIZE[size],
        className,
      )}
      {...props}
    />
  );
});

const SubContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(function DropdownMenuSubContent({ className, sideOffset = 6, ...props }, ref) {
  const size = useContext(DropdownMenuSizeContext);
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[9999] overflow-hidden outline-none",
        floatingPanelSurface,
        CONTENT_CLASS_BY_SIZE[size],
        className,
      )}
      {...props}
    />
  );
});

const RadioItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, ...props }, ref) {
  const size = useContext(DropdownMenuSizeContext);
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        cn(MENU_ITEM_CLASS, "relative"),
        ITEM_CLASS_BY_SIZE[size],
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenu = {
  Root,
  Trigger,
  Portal,
  Content,
  Group,
  Item,
  ItemIndicator,
  Separator,
  Sub,
  SubTrigger,
  SubContent,
  RadioGroup,
  RadioItem,
};
