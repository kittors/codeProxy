import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { motion } from "framer-motion";

type TabsValue = string;

interface TabsContextState {
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
}

const TabsContext = createContext<TabsContextState | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
}: PropsWithChildren<{
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
}>) {
  const valueObj = useMemo<TabsContextState>(
    () => ({ value, onValueChange }),
    [onValueChange, value],
  );
  return <TabsContext value={valueObj}>{children}</TabsContext>;
}

export function TabsList({ children }: PropsWithChildren) {
  const { value } = useTabs();
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
      className="scrollbar-hidden relative inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-full bg-[#EBEBEC] p-1 dark:bg-[#27272A]"
    >
      {indicator ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-0 top-1 z-0 rounded-full bg-white shadow-sm shadow-black/[0.04] dark:bg-[#46464C] dark:shadow-none"
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
}: PropsWithChildren<{
  value: TabsValue;
}>) {
  const { value: current, onValueChange } = useTabs();
  const active = current === value;

  const onClick = useCallback(() => {
    onValueChange(value);
  }, [onValueChange, value]);

  return (
    <button
      type="button"
      data-tab-value={value}
      onClick={onClick}
      className={
        active
          ? "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-semibold text-[#18181B] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:text-white dark:focus-visible:ring-white/20"
          : "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-medium text-[#96969B] transition-colors duration-200 hover:text-[#18181B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:text-[#9F9FA8] dark:hover:text-white dark:focus-visible:ring-white/20"
      }
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
