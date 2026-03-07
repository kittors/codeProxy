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
      className="relative inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
    >
      {/* Sliding indicator */}
      {indicator && (
        <div
          className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-xl bg-slate-900 dark:bg-white"
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
          ? "relative z-10 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:text-neutral-950 dark:focus-visible:ring-white/15"
          : "relative z-10 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-white/15"
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
    throw new Error("Tabs 组件必须在 <Tabs> 内使用");
  }
  return context;
};
