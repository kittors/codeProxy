import {
  Children,
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { useScrollFade } from "../hooks/useScrollFade";
import { HUE_BUTTON_ICON, hueForIcon, type Hue } from "../theme/hues";
import type { ControlSize } from "../utils/controlStyles";

type TabsValue = string;

/**
 * `neutral` 是管理后台一直在用的中性分段控件：浅灰槽 + 白色滑块；`brand` 用强调色
 * （浅色墨黑、深色反转）填充选中项，给门户这类需要更强选中态的场景。默认 neutral。
 */
export type TabsTone = "neutral" | "brand";

interface TabsContextState {
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
  size: ControlSize;
  tone: TabsTone;
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
  sm: "text-xs",
  default: "text-sm",
  lg: "text-sm",
};

const TabsContext = createContext<TabsContextState | null>(null);

export function Tabs({
  value,
  onValueChange,
  size = "default",
  tone = "neutral",
  children,
}: PropsWithChildren<{
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
  size?: ControlSize;
  tone?: TabsTone;
}>) {
  const valueObj = useMemo<TabsContextState>(
    () => ({ value, onValueChange, size, tone }),
    [onValueChange, size, tone, value],
  );
  return <TabsContext value={valueObj}>{children}</TabsContext>;
}

export function TabsList({
  children,
  className,
  style,
  onScroll,
  ...divProps
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const { size, value, tone } = useTabs();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 窄屏放不下时标签条横向滚动：两端还有标签就渐隐，而不是把半个标签硬切在边缘。
  // 淡掉的是滚动条自己的两端（槽的底色跟着淡出，正好表示「后面还有」）；放得下时不挂遮罩。
  const fade = useScrollFade<HTMLDivElement>({ size: 20, axis: "x" });
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      fade.ref.current = node;
    },
    [fade.ref],
  );
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
      ref={setContainerRef}
      {...divProps}
      onScroll={(event) => {
        fade.onScroll();
        onScroll?.(event);
      }}
      style={fade.style ? { ...style, ...fade.style } : style}
      role="tablist"
      className={[
        // w-fit + self-start: stay content-sized even when parent is flex-col
        // (default align-items:stretch would stretch the pill bar full width)
        // overscroll-x-contain: keep edge bounce on the tab strip only; without it,
        // horizontal overscroll chains to the viewport and rubber-bands PageBackground.
        "scrollbar-hidden relative inline-flex w-fit max-w-full shrink-0 self-start gap-0.5 overflow-x-auto overscroll-x-contain whitespace-nowrap rounded-full bg-track p-0.5",
        tabsListHeightBySize[size],
        fade.className,
        className,
      ].join(" ")}
    >
      {indicator ? (
        <motion.div
          aria-hidden="true"
          className={[
            "pointer-events-none absolute bottom-0.5 left-0 top-0.5 z-0 rounded-full",
            tone === "brand"
              ? "bg-accent"
              : "bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_3px_rgb(0_0_0/0.1)] dark:bg-white/[0.12] dark:shadow-[0_1px_2px_rgb(0_0_0/0.4)]",
          ].join(" ")}
          initial={false}
          animate={{ x: indicator.x, width: indicator.width }}
          // 滑块用带一点回弹的曲线：落位时轻微越过再回正，切换读起来有「吸附」感。
          transition={{ duration: 0.25, ease: [0.3, 1.25, 0.5, 1] }}
        />
      ) : null}
      {children}
    </div>
  );
}

function firstIconHue(children: ReactNode): Hue | null {
  let found: Hue | null = null;
  Children.forEach(children, (child) => {
    if (found) return;
    found = hueForIcon(child);
  });
  return found;
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
  const { size, value: current, onValueChange, tone } = useTabs();
  const active = current === value;
  // 标签里的图标按全站注册表上色（可视化是天蓝的眼睛、源码是品红的代码……，只在图标着色为
  // 「多彩」时生效）；强调色实心的选中块上图标跟随文字色，不再染色。
  const iconHue = tone === "brand" && active ? null : firstIconHue(children);

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
        // 选中与未选中同为 font-medium，只换颜色：切换字重会改变文字宽度，右侧的标签会跟着挪动。
        // 焦点描边内缩：标签条是 overflow-x-auto，外扩的描边会被裁掉上下两条边。
        "relative z-10 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors duration-150 focus-visible:-outline-offset-2",
        tabsTriggerHeightBySize[size],
        tabsTriggerPaddingBySize[size],
        tabsTriggerTextBySize[size],
        active
          ? tone === "brand"
            ? "text-accent-fg"
            : "text-ink"
          : "text-ink-2 hover:text-ink",
        iconHue ? HUE_BUTTON_ICON[iconHue] : null,
        buttonProps.className,
      ]
        .filter(Boolean)
        .join(" ")}
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
