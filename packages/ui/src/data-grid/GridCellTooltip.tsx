import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TooltipBubble, hasOverflowingContent, type TooltipPlacement } from "../overlays/Tooltip";

/**
 * 单元格里关键数据的提示（精确值、拆分明细、口径说明）。
 *
 * 和 HoverTooltip 的区别是有「预热」：第一次悬停等 320ms 才弹，免得鼠标划过一片单元格时
 * 提示一路闪；一旦弹出过，在相邻单元格之间移动就立即切换，直到离开表格 400ms 后才重新等待。
 * 同一时刻只开一个：每个单元格只套一层，不和 OverflowTooltip 嵌套（旧请求日志里模型名
 * 嵌了两层提示，底部会叠出两个一模一样的气泡）。
 *
 * 提示里的内容在行展开详情里都有一份，键盘和读屏用户不依赖悬停。
 *
 * overflowOnly：只在内容被截断时才弹（单元格自动的「全文提示」用它），放得下就不重复一遍。
 */

const OPEN_DELAY_MS = 320;
const WARM_MS = 400;
let warmUntil = 0;

export function GridCellTooltip({
  content,
  children,
  placement = "top",
  className,
  overflowOnly = false,
  focusable = false,
}: {
  content: ReactNode;
  children: ReactNode;
  placement?: TooltipPlacement;
  className?: string;
  overflowOnly?: boolean;
  /** 自己可聚焦（键盘 Tab 到这里也弹出），用于不在按钮里的表头说明。 */
  focusable?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const clear = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback(() => {
    if (content === null || content === undefined || content === false || content === "") return;
    if (overflowOnly && ref.current && !hasOverflowingContent(ref.current)) return;
    clear();
    const wait = Date.now() < warmUntil ? 0 : OPEN_DELAY_MS;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setOpen(true);
    }, wait);
  }, [clear, content, overflowOnly]);

  const hide = useCallback(() => {
    clear();
    if (openRef.current) warmUntil = Date.now() + WARM_MS;
    setOpen(false);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return (
    <span
      ref={ref}
      data-tooltip-managed="true"
      className={["inline-flex min-w-0 max-w-full", className ?? ""].join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      tabIndex={focusable ? 0 : undefined}
      onFocus={focusable ? show : undefined}
      onBlur={focusable ? hide : undefined}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <TooltipBubble id={id} open={open} content={content} anchorRef={ref} placement={placement} />
    </span>
  );
}

/** 提示气泡里的「标签 — 数值」两列明细。气泡是反色的，文字一律用 canvas 色系。 */
export function GridTooltipRows({
  title,
  rows,
  footnote,
}: {
  title?: ReactNode;
  rows: readonly (readonly [ReactNode, ReactNode])[];
  footnote?: ReactNode;
}) {
  return (
    <span className="block min-w-[12rem] py-0.5">
      {title ? <span className="mb-1.5 block text-xs font-semibold">{title}</span> : null}
      <span className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {rows.map(([label, value], index) => (
          <span key={index} className="contents">
            <span className="whitespace-nowrap opacity-70">{label}</span>
            <span className="whitespace-nowrap text-right tabular-nums">{value}</span>
          </span>
        ))}
      </span>
      {footnote ? <span className="mt-1.5 block text-2xs opacity-65">{footnote}</span> : null}
    </span>
  );
}
