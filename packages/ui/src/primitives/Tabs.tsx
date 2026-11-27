import {
  Children,
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import { initSeg } from "satin-ui";
import { useScrollFade } from "../hooks/useScrollFade";
import type { ControlSize } from "../utils/controlStyles";

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
 * Satin 原生分段标签栏（直连 `satin-ui` 的 `initSeg` 流体双曲线物理滑块引擎）：
 * 前缘先到、后缘延迟 45ms 跟上、落定时纵向轻压回弹，中途点击连续接续不回跳；
 * 窄屏溢出时保持横向滚动与两端渐隐。
 */
export function TabsList({
  children,
  className,
  ...divProps
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const { size, value, tone } = useTabs();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const segRef = useRef<ReturnType<typeof initSeg> | null>(null);
  const fade = useScrollFade<HTMLDivElement>({ size: 20, axis: "x" });
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      fade.ref.current = node;
    },
    [fade.ref],
  );

  // 用标签项数量/key 签名监听动态增删标签；标签集合不变时复用同一个 initSeg 实例以播放平滑位移动画。
  const tabSignature = useMemo(() => {
    const keys: string[] = [];
    Children.forEach(children, (child) => {
      if (child && typeof child === "object" && "props" in child) {
        const v = (child.props as { value?: unknown }).value;
        if (v !== undefined) keys.push(String(v));
      }
    });
    return keys.join("\u001f");
  }, [children]);

  const valueRef = useRef(value);
  valueRef.current = value;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-tab-value]"));
    const initialIdx = buttons.findIndex((btn) => btn.dataset.tabValue === valueRef.current);
    const api = initSeg(container, undefined, initialIdx, {
      role: "tab",
      controlled: true,
      fitScroll: false,
      keyboard: false,
    });
    segRef.current = api;
    return () => {
      api.destroy();
      if (segRef.current === api) segRef.current = null;
    };
  }, [tabSignature]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const api = segRef.current;
    if (!container || !api) return;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-tab-value]"));
    const nextIdx = buttons.findIndex((btn) => btn.dataset.tabValue === value);
    api.sync(nextIdx, false);
  }, [value, tabSignature]);

  return (
    <div
      ref={setContainerRef}
      {...divProps}
      role="tablist"
      className={[
        "sn-seg bg-sn-sunken scrollbar-hidden !inline-flex w-fit max-w-full shrink-0 self-start gap-0.5 overflow-x-auto overscroll-x-contain whitespace-nowrap",
        tabsListSizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
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
