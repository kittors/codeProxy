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

type TabsValue = string;

interface TabsContextState {
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
  registerTrigger: (value: TabsValue, element: HTMLButtonElement | null) => void;
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
  const triggersRef = useRef<Map<TabsValue, HTMLButtonElement>>(new Map());

  const registerTrigger = useCallback(
    (triggerValue: TabsValue, element: HTMLButtonElement | null) => {
      if (element) {
        triggersRef.current.set(triggerValue, element);
      } else {
        triggersRef.current.delete(triggerValue);
      }
    },
    [],
  );

  const valueObj = useMemo<TabsContextState>(
    () => ({ value, onValueChange, registerTrigger }),
    [onValueChange, registerTrigger, value],
  );
  return <TabsContext value={valueObj}>{children}</TabsContext>;
}

export function TabsList({ children }: PropsWithChildren) {
  const { value } = useTabs();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  const prevValueRef = useRef<TabsValue | null>(null);

  // Measure the active tab and update indicator position
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeButton = container.querySelector<HTMLButtonElement>(
      `[data-tab-value="${CSS.escape(value)}"]`,
    );
    if (!activeButton) {
      setIndicator(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setIndicator({
      left: buttonRect.left - containerRect.left + container.scrollLeft,
      width: buttonRect.width,
    });

    prevValueRef.current = value;
  }, [value]);

  // Also listen to resize/mutation to keep indicator in sync
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const activeButton = container.querySelector<HTMLButtonElement>(
        `[data-tab-value="${CSS.escape(value)}"]`,
      );
      if (!activeButton) return;
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setIndicator({
        left: buttonRect.left - containerRect.left + container.scrollLeft,
        width: buttonRect.width,
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value]);

  // Skip transition on first render
  const hasRendered = useRef(false);
  useEffect(() => {
    hasRendered.current = true;
  }, []);

  return (
    <div
      ref={containerRef}
      className="scrollbar-hidden relative inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-full bg-[#EBEBEC] p-1 dark:bg-[#27272A]"
    >
      {/* Sliding indicator */}
      {indicator && (
        <div
          className="pointer-events-none absolute bottom-1 top-1 z-0 rounded-full bg-white dark:bg-[#46464C]"
          style={{
            left: indicator.left,
            width: indicator.width,
            transition: hasRendered.current
              ? "left 250ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
          }}
        />
      )}
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
