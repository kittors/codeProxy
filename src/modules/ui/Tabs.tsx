import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
} from "react";
import { motion } from "framer-motion";
import type { ControlSize } from "@/modules/ui/controlStyles";

type TabsValue = string;

interface TabsContextState {
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
  size: ControlSize;
}

const tabsListHeightBySize: Record<ControlSize, string> = {
  sm: "h-8",
  default: "h-9",
  lg: "h-10",
};

const tabsTriggerHeightBySize: Record<ControlSize, string> = {
  sm: "h-7",
  default: "h-8",
  lg: "h-9",
};

const tabsTriggerPaddingBySize: Record<ControlSize, string> = {
  sm: "px-2.5",
  default: "px-3",
  lg: "px-4",
};

const tabsTriggerTextBySize: Record<ControlSize, string> = {
  sm: "text-[11px]",
  default: "text-xs",
  lg: "text-sm",
};

const TabsContext = createContext<TabsContextState | null>(null);

export function Tabs({
  value,
  onValueChange,
  size = "default",
  children,
}: PropsWithChildren<{
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
  size?: ControlSize;
}>) {
  const valueObj = useMemo<TabsContextState>(
    () => ({ value, onValueChange, size }),
    [onValueChange, size, value],
  );
  return <TabsContext value={valueObj}>{children}</TabsContext>;
}

export function TabsList({ children }: PropsWithChildren) {
  const { size, value } = useTabs();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeButton = container.querySelector<HTMLButtonElement>(
      `[data-tab-value="${CSS.escape(value)}"]`,
    );
    if (!activeButton) {
      setIndicator(null);
      return;
    }

    setIndicator({
      x: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    });
  }, [value]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(updateIndicator);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={[
        "scrollbar-hidden relative inline-flex max-w-full gap-0.5 overflow-x-auto whitespace-nowrap rounded-full bg-[#EBEBEC] p-0.5 dark:bg-[#27272A]",
        tabsListHeightBySize[size],
      ].join(" ")}
    >
      {indicator ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0.5 left-0 top-0.5 z-0 rounded-full bg-white shadow-sm shadow-black/[0.04] dark:bg-[#46464C] dark:shadow-none"
          initial={false}
          animate={{ x: indicator.x, width: indicator.width }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        />
      ) : null}
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  ...buttonProps
}: PropsWithChildren<
  {
    value: TabsValue;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "value">
>) {
  const { size, value: current, onValueChange } = useTabs();
  const active = current === value;

  const onClick = useCallback(() => {
    onValueChange(value);
  }, [onValueChange, value]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-tab-value={value}
      onClick={onClick}
      {...buttonProps}
      className={[
        "relative z-10 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20",
        tabsTriggerHeightBySize[size],
        tabsTriggerPaddingBySize[size],
        tabsTriggerTextBySize[size],
        active
          ? "font-semibold text-[#18181B] dark:text-white"
          : "font-medium text-[#96969B] hover:text-[#18181B] dark:text-[#9F9FA8] dark:hover:text-white",
        buttonProps.className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: PropsWithChildren<{
  value: TabsValue;
  className?: string;
}>) {
  const { value: current } = useTabs();
  if (current !== value) return null;
  return <div className={className}>{children}</div>;
}

const useTabs = (): TabsContextState => {
  const context = use(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within <Tabs>");
  }
  return context;
};
