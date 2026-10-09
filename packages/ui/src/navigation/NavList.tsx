import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useScrollFade } from "../hooks/useScrollFade";
import { dialogToneClass, type DialogTone } from "../overlays/DialogIcon";
import { cn } from "../utils/selectStyles";

export interface NavListItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** 图标块色调，默认按图标自动取色；厂商 logo 保持中性底。 */
  tone?: DialogTone;
  /** 右侧的小标记（数量、状态）。 */
  badge?: ReactNode;
  /** 名称后的小圆点（例如「这一组有未保存的修改」）。 */
  dot?: boolean;
  /** 读屏用的补充说明（例如「有未保存的修改」），配合 dot 使用。 */
  srHint?: string;
}

// 竖排生效的断点：弹窗里的列表在 sm 就竖排；页面侧栏（例如配置页）要到 lg 才有余地放下一列。
// Tailwind 需要看到完整类名，所以两套写死。
const LAYOUT = {
  sm: {
    root: "flex gap-1 overflow-x-auto px-3 pb-3 sm:grid sm:gap-0 sm:overflow-visible sm:px-3 sm:pb-4",
    group: "flex shrink-0 gap-1 sm:grid sm:gap-0.5",
    label: "hidden px-2.5 pt-4 pb-1.5 text-2xs font-semibold tracking-wide text-ink-3 uppercase sm:block",
  },
  lg: {
    root: "flex gap-1 overflow-x-auto pb-1 lg:grid lg:gap-0 lg:overflow-visible lg:pb-0",
    group: "flex shrink-0 gap-1 lg:grid lg:gap-0.5",
    label: "hidden px-2.5 pt-4 pb-1.5 text-2xs font-semibold tracking-wide text-ink-3 uppercase lg:block",
  },
} as const;

export interface NavListGroup {
  id: string;
  label?: ReactNode;
  items: readonly NavListItem[];
}

/**
 * 竖向分组导航：左侧一列入口、右侧对应内容。来自「添加 AI 账号」的提供商列表——
 * 分组小标题、图标块、选中项是一张浮起的白卡片并在项之间弹簧滑动。
 *
 * - `tabs`：切换右侧面板（role=tablist，方向键移动并选中，Tab 只停在选中项）；
 * - `nav`：页内锚点导航（例如配置页的分区目录），选中项标 aria-current，方向键同样可用。
 * 窄屏自动变成横向滚动的一条，分组小标题隐藏。
 */
export function NavList({
  mode = "tabs",
  groups,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  panelId,
  breakpoint = "sm",
  className,
}: {
  mode?: "tabs" | "nav";
  groups: readonly NavListGroup[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** 每一项的 id 前缀（`${idPrefix}-${item.id}`），tabpanel 用它做 aria-labelledby。 */
  idPrefix?: string;
  /** tabs 模式下右侧面板的 id。 */
  panelId?: string;
  /** 从哪个宽度开始竖排；更窄时是横向滚动的一条。 */
  breakpoint?: keyof typeof LAYOUT;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const generatedId = useId();
  const prefix = idPrefix ?? `nav-${generatedId}`;
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 窄屏横排时列表自己横向滚动：两端还有项时渐隐，而不是在边缘把半个项硬切掉。
  // 竖排后没有横向溢出，渐隐自动收起。
  const fade = useScrollFade<HTMLDivElement>({ size: 24, axis: "x" });
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      fade.ref.current = node;
    },
    [fade.ref],
  );
  const items = groups.flatMap((group) => group.items);
  const isTabs = mode === "tabs";
  const layout = LAYOUT[breakpoint];

  // 页内导航跟着滚动换了当前项时，把它滚进目录的可视范围。只调整目录自己的滚动位置：
  // 用 scrollIntoView 会连带滚动外层页面，把用户正在看的内容拽走。
  // 竖排时滚动的是外层标了 data-nav-scroll 的容器，窄屏横排时滚动的是列表本身。
  useEffect(() => {
    if (isTabs) return;
    const button = buttonsRef.current[value];
    const root = rootRef.current;
    if (!button || !root) return;
    const rect = button.getBoundingClientRect();
    const vertical = button.closest<HTMLElement>("[data-nav-scroll]");
    if (vertical) {
      const box = vertical.getBoundingClientRect();
      if (rect.top < box.top) vertical.scrollTop -= box.top - rect.top + 8;
      else if (rect.bottom > box.bottom) vertical.scrollTop += rect.bottom - box.bottom + 8;
    }
    const box = root.getBoundingClientRect();
    if (rect.left < box.left) root.scrollLeft -= box.left - rect.left + 8;
    else if (rect.right > box.right) root.scrollLeft += rect.right - box.right + 8;
  }, [isTabs, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key) || items.length === 0) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === value);
    const last = items.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    buttonsRef.current[target.id]?.focus();
  };

  return (
    <div
      ref={setRootRef}
      role={isTabs ? "tablist" : "navigation"}
      aria-orientation={isTabs ? "vertical" : undefined}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onScroll={fade.onScroll}
      style={fade.style}
      className={cn(layout.root, fade.className, className)}
    >
      {groups.map((group) => {
        if (group.items.length === 0) return null;
        return (
          <div key={group.id} role="presentation" className={layout.group}>
            {group.label ? (
              <p role="presentation" className={layout.label}>
                {group.label}
              </p>
            ) : null}
            {group.items.map((item) => {
              const selected = item.id === value;
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    buttonsRef.current[item.id] = node;
                  }}
                  type="button"
                  id={`${prefix}-${item.id}`}
                  {...(isTabs
                    ? {
                        role: "tab",
                        "aria-selected": selected,
                        "aria-controls": panelId,
                        tabIndex: selected ? 0 : -1,
                      }
                    : { "aria-current": selected ? ("true" as const) : undefined })}
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                    selected ? "text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                  )}
                >
                  {selected ? (
                    <motion.span
                      layoutId={`${prefix}-selection`}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl bg-elevated shadow-control"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 520, damping: 40 }
                      }
                    />
                  ) : null}
                  {item.icon ? (
                    <span
                      className={cn(
                        "relative grid h-7 w-7 shrink-0 place-items-center rounded-lg [&_svg.lucide]:size-[16px]",
                        dialogToneClass(item.tone ?? "auto", item.icon),
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="relative min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {item.dot ? (
                    <span
                      aria-hidden="true"
                      className="relative h-1.5 w-1.5 shrink-0 rounded-full bg-accent colorful:bg-sky-500"
                    />
                  ) : null}
                  {item.srHint ? <span className="sr-only">{item.srHint}</span> : null}
                  {item.badge ? <span className="relative shrink-0">{item.badge}</span> : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
