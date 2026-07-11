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

const CONTENT_CLASS_BY_SIZE: Record<ControlSize, string> = {
  sm: "min-w-28 p-1",
  default: "min-w-36 p-1.5",
  lg: "min-w-40 p-2",
};

const ITEM_CLASS_BY_SIZE: Record<ControlSize, string> = {
  sm: "gap-1.5 rounded-md px-2 py-1.5 text-xs",
  default: "gap-2 rounded-lg px-3 py-2 text-sm",
  lg: "gap-2.5 rounded-lg px-3.5 py-2.5 text-sm",
};

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
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(function DropdownMenuItem({ className, ...props }, ref) {
  const size = useContext(DropdownMenuSizeContext);
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "flex w-full cursor-default select-none items-center font-medium text-slate-700 outline-none transition-colors duration-150 focus:bg-slate-100 data-[highlighted]:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 dark:text-white/75 dark:focus:bg-white/10 dark:data-[highlighted]:bg-white/10",
        ITEM_CLASS_BY_SIZE[size],
        className,
      )}
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
      className={cn("my-1 h-px bg-slate-200 dark:bg-white/10", className)}
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
};
