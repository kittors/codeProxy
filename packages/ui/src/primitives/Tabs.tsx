import {
  Children,
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useScrollFade } from "../hooks/useScrollFade";
import { HUE_BUTTON_ICON, hueForIcon, type Hue } from "../theme/hues";
import type { ControlSize } from "../utils/controlStyles";
import { useSatinFluidThumb } from "../utils/satinMotion";

type TabsValue = string;

export type TabsTone = "neutral" | "brand";

interface TabsContextState {
  value: TabsValue;
  onValueChange: (next: TabsValue) => void;
  size: ControlSize;
  tone: TabsTone;
}

const tabsListSizeClass: Record<ControlSize, string> = {
  sm: "sn-sm",
  default: "",
  lg: "sn-lg",
};

const tabsTriggerPaddingBySize: Record<ControlSize, string> = {
  sm: "!px-2.5 !text-xs",
  default: "!px-3 !text-sm",
  lg: "!px-4 !text-sm",
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

/**
 * Satin 分段标签栏（.sn-seg + .sn-thumb + edgeFrames 流体物理滑块微动效）：
 * 前缘先到、后缘跟上、落定时纵向轻压回弹，窄屏溢出时保持横向滚动与两端渐隐。
 */
export function TabsList({
  children,
  className,
  ...divProps
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const { size, value, tone } = useTabs();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const fade = useScrollFade<HTMLDivElement>({ size: 20, axis: "x" });
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      fade.ref.current = node;
    },
    [fade.ref],
  );

  const selector = `[data-tab-value="${CSS.escape(value)}"]`;
  useSatinFluidThumb(containerRef, thumbRef, selector, value);

  return (
    <div
      ref={setContainerRef}
      {...divProps}
      role="tablist"
      className={[
        "sn-seg bg-track scrollbar-hidden !inline-flex w-fit max-w-full shrink-0 self-start gap-0.5 overflow-x-auto overscroll-x-contain whitespace-nowrap",
        tabsListSizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        className={[
          "sn-thumb",
          tone === "brand" ? "!bg-[var(--sn-accent)] !shadow-none" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ opacity: 0 }}
      />
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
        "!inline-flex h-full shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium focus-visible:-outline-offset-2",
        tabsTriggerPaddingBySize[size],
        active && tone === "brand" ? "!text-[var(--sn-on-primary)]" : null,
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
