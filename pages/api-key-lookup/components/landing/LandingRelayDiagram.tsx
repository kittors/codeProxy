import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import { LogoMark, VendorIcon } from "@code-proxy/assets";

const UPSTREAMS = ["claude", "openai", "gemini", "grok"] as const;

/*
 * 三列共用同一套坐标，连线端点才能真正对上图标中心：
 * 画布高 192px，viewBox 高度取同值（preserveAspectRatio="none" 下 1:1 映射）；
 * 左列 4 个 40px 图标按 justify-between 铺满 192px，圆心即 UPSTREAM_Y；
 * 右侧标记盒 56px 垂直居中，圆心为 96，正是连线的汇聚点。
 */
const DIAGRAM_HEIGHT = 192;
const CENTER_Y = DIAGRAM_HEIGHT / 2;
const ICON_BOX = 40;
const UPSTREAM_Y = UPSTREAMS.map((_, index) => {
  const gap = (DIAGRAM_HEIGHT - ICON_BOX * UPSTREAMS.length) / (UPSTREAMS.length - 1);
  return ICON_BOX / 2 + index * (ICON_BOX + gap);
});

/**
 * 「多路上游 → 网关 → 一个入口」的示意图。
 *
 * 连线用 SVG stroke-dasharray 做流动效果：相比逐个小球沿路径运动，dash 动画只占一条
 * path，滚动时不会掉帧，也天然支持 prefers-reduced-motion（关掉动画即为静态虚线）。
 */
export function LandingRelayDiagram({ appLabel }: { appLabel: string }) {
  const reduceMotion = useReducedMotion();
  const gradientId = `relay-flow-${useId()}`;

  return (
    <div className="relative mt-10 flex h-48 items-center justify-between gap-4">
      <ul className="flex h-full shrink-0 flex-col justify-between">
        {UPSTREAMS.map((id) => (
          <li
            key={id}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-slate-900/8 dark:bg-white/[0.06] dark:ring-white/10"
          >
            <VendorIcon modelId={id} size={18} />
          </li>
        ))}
      </ul>

      <svg
        viewBox={`0 0 120 ${DIAGRAM_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-full min-w-0 flex-1"
        aria-hidden
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="120"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#6366F1" stopOpacity="0.2" />
            <stop offset="0.55" stopColor="#6366F1" stopOpacity="0.9" />
            <stop offset="1" stopColor="#06B6D4" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="5 7"
          className={
            reduceMotion ? undefined : "motion-safe:animate-[landing-flow_1.4s_linear_infinite]"
          }
        >
          {UPSTREAM_Y.map((y) => (
            <path key={y} d={`M0 ${y} C46 ${y} 56 ${CENTER_Y} 120 ${CENTER_Y}`} />
          ))}
        </g>
      </svg>

      {/*
        标记盒单独垂直居中，标签用绝对定位挂在下方——若把标签算进同一个 flex 列，
        整列居中会把标记推离连线汇聚点（也就是之前连线看着没对齐的原因）。
      */}
      <div className="relative flex h-full shrink-0 items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-indigo-500/25 dark:bg-white/[0.06] dark:ring-indigo-400/25">
          <LogoMark size={20} />
        </span>
        <span className="absolute left-1/2 top-[calc(50%+2.25rem)] w-max -translate-x-1/2 font-display text-2xs uppercase tracking-[0.06em] text-slate-400 dark:text-white/40">
          {appLabel}
        </span>
      </div>
    </div>
  );
}
