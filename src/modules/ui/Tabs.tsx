import { createContext, use, useCallback, useMemo, type PropsWithChildren } from "react";

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
  return (
    <div className="scrollbar-hidden inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-full bg-[#EBEBEC] p-1 dark:bg-[#27272A]">
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
          ? "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white px-3 text-xs font-semibold text-[#18181B] shadow-sm shadow-black/[0.04] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:bg-[#46464C] dark:text-white dark:shadow-none dark:focus-visible:ring-white/20"
          : "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-medium text-[#96969B] transition-colors duration-200 hover:text-[#18181B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:text-[#9F9FA8] dark:hover:text-white dark:focus-visible:ring-white/20"
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
