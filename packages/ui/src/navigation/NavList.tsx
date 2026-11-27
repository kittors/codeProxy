import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { reduced } from "satin-ui";
import { useScrollFade } from "../hooks/useScrollFade";
import { dialogToneClass, type DialogTone } from "../overlays/DialogIcon";
import { cssEase, EASE_POP } from "../utils/motion";
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
    root: "relative flex gap-1 overflow-x-auto px-3 pb-3 sm:grid sm:gap-0 sm:overflow-visible sm:px-3 sm:pb-4",
    group: "flex shrink-0 gap-1 sm:grid sm:gap-0.5",
    label: "hidden px-2.5 pt-4 pb-1.5 text-2xs font-semibold tracking-wide text-sn-label3 uppercase sm:block",
  },
  lg: {
    root: "relative flex gap-1 overflow-x-auto pb-1 lg:grid lg:gap-0 lg:overflow-visible lg:pb-0",
    group: "flex shrink-0 gap-1 lg:grid lg:gap-0.5",
    label: "hidden px-2.5 pt-4 pb-1.5 text-2xs font-semibold tracking-wide text-sn-label3 uppercase lg:block",
  },
} as const;

export interface NavListGroup {
  id: string;
  label?: ReactNode;
  items: readonly NavListItem[];
}

interface ThumbBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isMotionReduced(): boolean {
  try {
    return reduced();
  } catch {
    return false;
  }
}

/**
 * 竖向分组导航：左侧一列入口、右侧对应内容。来自「添加 AI 账号」的提供商列表：
 * 分组小标题、图标块、选中项是一张浮起的白卡片，采用合成线程 WAAPI（`--sn-ease-out-strong`，
 * 零 framer-motion）在竖排或窄屏横排项之间流畅滑动。
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
  const generatedId = useId();
  const prefix = idPrefix ?? `nav-${generatedId}`;
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const prevBoxRef = useRef<ThumbBox | null>(null);
  const animRef = useRef<Animation | null>(null);
  const [thumbReady, setThumbReady] = useState(false);

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

  const measureActive = useCallback((): ThumbBox | null => {
    const root = rootRef.current;
    const button = buttonsRef.current[value];
    if (!root || !button) return null;
    const rootRect = root.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();
    if (btnRect.width <= 0 || btnRect.height <= 0) return null;
    return {
      left: btnRect.left - rootRect.left + root.scrollLeft,
      top: btnRect.top - rootRect.top + root.scrollTop,
      width: btnRect.width,
      height: btnRect.height,
    };
  }, [value]);

  const applyThumbBox = useCallback((box: ThumbBox) => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    thumb.style.opacity = "1";
    thumb.style.width = `${box.width}px`;
    thumb.style.height = `${box.height}px`;
    thumb.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
  }, []);

  // FLIP 合成线程滑动：同时兼容竖排上下滑与窄屏横排左右滑。
  useLayoutEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    const next = measureActive();
    if (!next) {
      thumb.style.opacity = "0";
      setThumbReady(false);
      prevBoxRef.current = null;
      return;
    }

    const prev = prevBoxRef.current;
    prevBoxRef.current = next;
    applyThumbBox(next);
    setThumbReady(true);

    if (
      !prev ||
      isMotionReduced() ||
      typeof thumb.animate !== "function" ||
      (Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5)
    ) {
      return;
    }

    animRef.current?.cancel();
    const sx = prev.width / Math.max(1, next.width);
    const sy = prev.height / Math.max(1, next.height);
    const anim = thumb.animate(
      [
        { transform: `translate3d(${prev.left}px, ${prev.top}px, 0) scale(${sx}, ${sy})` },
        { transform: `translate3d(${next.left}px, ${next.top}px, 0) scale(1, 1)` },
      ],
      { duration: 240, easing: cssEase(EASE_POP) },
    );
    animRef.current = anim;
    anim.onfinish = () => {
      if (animRef.current === anim) animRef.current = null;
    };
  }, [applyThumbBox, measureActive]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const box = measureActive();
      if (!box) return;
      prevBoxRef.current = box;
      applyThumbBox(box);
      setThumbReady(true);
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      animRef.current?.cancel();
    };
  }, [applyThumbBox, measureActive]);

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
      className={cn(layout.root, className)}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        data-nav-thumb=""
        className="pointer-events-none absolute top-0 left-0 rounded-xl border border-sn-line bg-sn-raised opacity-0 shadow-sn-card"
        style={{ transformOrigin: "top left" }}
      />
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
                    "relative z-[1] flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors duration-150 ease-[var(--sn-ease-out)]",
                    selected
                      ? thumbReady
                        ? "text-sn-label"
                        : "border border-sn-line bg-sn-raised text-sn-label shadow-sn-card"
                      : "text-sn-label2 hover:bg-sn-hover hover:text-sn-label",
                  )}
                >
                  {item.icon ? (
                    <span
                      className={cn(
                        "relative grid h-7 w-7 shrink-0 place-items-center rounded-lg [&_svg:is(.lucide,.sn-ic)]:size-[16px]",
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
                      className="relative h-1.5 w-1.5 shrink-0 rounded-full bg-sn-accent colorful:bg-sky-500"
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
