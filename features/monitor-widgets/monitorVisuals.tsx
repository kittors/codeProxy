import { useEffect, useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * 监控类页面共享的视觉零件（仪表盘的系统监控、运行观测的监控中心）：分类配色、图标底块、
 * 渐变环、渐变进度条、状态标签。放在 feature 里而不是某个页面下，是因为页面之间不能互相引用。
 *
 * 配色只用四个色系，各有固定含义，同一类指标在环、条、图标上始终同色，避免满屏彩虹：
 * - emerald：健康、网络、运行时间（「一切正常」的颜色）
 * - sky：CPU、磁盘、数据库（算力与存储）
 * - violet：内存、协程（运行时）
 * - amber：日志（会持续增长、需要留意的存储）；监控中心里是费用
 * - indigo：监控中心的耗时与首字时间
 * 告警态（≥80% 琥珀、≥95% 红）会覆盖分类色——那时用户需要看到的是「出问题了」而不是类别；
 * rose 只给告急态用。
 */

export type MonitorHue = "emerald" | "sky" | "violet" | "amber" | "indigo" | "rose";

type HueStyle = {
  /** 图标底块的淡底与图标色 */
  chip: string;
  icon: string;
  /** 进度条填充与底槽 */
  bar: string;
  track: string;
  /** 环形图渐变的两端（SVG stop-color 只认颜色值） */
  ring: readonly [string, string];
};

export const MONITOR_HUES: Record<MonitorHue, HueStyle> = {
  emerald: {
    chip: "bg-emerald-500/10 dark:bg-emerald-400/15",
    icon: "text-emerald-600 dark:text-emerald-300",
    bar: "bg-gradient-to-r from-emerald-400 to-teal-500",
    track: "bg-emerald-500/10 dark:bg-emerald-400/15",
    ring: ["#34d399", "#14b8a6"],
  },
  sky: {
    chip: "bg-sky-500/10 dark:bg-sky-400/15",
    icon: "text-sky-600 dark:text-sky-300",
    bar: "bg-gradient-to-r from-sky-400 to-blue-500",
    track: "bg-sky-500/10 dark:bg-sky-400/15",
    ring: ["#38bdf8", "#3b82f6"],
  },
  violet: {
    chip: "bg-violet-500/10 dark:bg-violet-400/15",
    icon: "text-violet-600 dark:text-violet-300",
    bar: "bg-gradient-to-r from-violet-400 to-purple-500",
    track: "bg-violet-500/10 dark:bg-violet-400/15",
    ring: ["#a78bfa", "#a855f7"],
  },
  amber: {
    chip: "bg-amber-500/10 dark:bg-amber-400/15",
    icon: "text-amber-600 dark:text-amber-300",
    bar: "bg-gradient-to-r from-amber-300 to-orange-500",
    track: "bg-amber-500/10 dark:bg-amber-400/15",
    ring: ["#fcd34d", "#f97316"],
  },
  indigo: {
    chip: "bg-indigo-500/10 dark:bg-indigo-400/15",
    icon: "text-indigo-600 dark:text-indigo-300",
    bar: "bg-gradient-to-r from-indigo-400 to-violet-500",
    track: "bg-indigo-500/10 dark:bg-indigo-400/15",
    ring: ["#818cf8", "#8b5cf6"],
  },
  /** 只给告急态用，不作为任何指标的分类色。 */
  rose: {
    chip: "bg-rose-500/10 dark:bg-rose-400/15",
    icon: "text-rose-600 dark:text-rose-300",
    bar: "bg-gradient-to-r from-rose-400 to-red-500",
    track: "bg-rose-500/10 dark:bg-rose-400/15",
    ring: ["#fb7185", "#e11d48"],
  },
};

export type UsageLevel = "normal" | "warn" | "critical";

export const usageLevel = (pct: number): UsageLevel =>
  pct >= 95 ? "critical" : pct >= 80 ? "warn" : "normal";

/** 占用类指标的配色：正常用分类色，告警覆盖成琥珀 / 红。 */
export const usageHue = (hue: MonitorHue, pct: number): HueStyle => {
  const level = usageLevel(pct);
  if (level === "critical") return MONITOR_HUES.rose;
  if (level === "warn") return MONITOR_HUES.amber;
  return MONITOR_HUES[hue];
};

export const USAGE_LEVEL_LABEL_KEY: Record<UsageLevel, string> = {
  normal: "system_monitor.status_normal",
  warn: "system_monitor.status_warn",
  critical: "system_monitor.status_critical",
};

const LEVEL_PILL: Record<UsageLevel, string> = {
  normal: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  warn: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  critical: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

const LEVEL_DOT: Record<UsageLevel, string> = {
  normal: "bg-emerald-500 ring-emerald-500/20",
  warn: "bg-amber-500 ring-amber-500/20",
  critical: "bg-rose-500 ring-rose-500/20",
};

export function LevelPill({ level, children }: { level: UsageLevel; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${LEVEL_PILL[level]}`}>
      {children}
    </span>
  );
}

/** 状态小圆点：实心点外加一圈同色淡光晕，正常时是绿色而不是一颗看不出意思的灰点。 */
export function LevelDot({ level, label }: { level: UsageLevel; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`size-2 shrink-0 rounded-full ring-4 ${LEVEL_DOT[level]}`}
    />
  );
}

export function IconChip({ icon: Icon, hue }: { icon: LucideIcon; hue: HueStyle }) {
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${hue.chip}`}>
      <Icon size={16} className={hue.icon} aria-hidden="true" />
    </span>
  );
}

/**
 * 渐变进度条：首次出现从 0 长到实际宽度（quota-bar-grow 关键帧），之后数值变化滑到新宽度。
 * 用 width 而不是 scaleX：缩放会把圆头一起压扁。
 */
export function MeterBar({ pct, hue, className = "h-2" }: { pct: number; hue: HueStyle; className?: string }) {
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className={`relative w-full overflow-hidden rounded-full ${hue.track} ${className}`}>
      {width > 0 ? (
        <div
          data-testid="monitor-meter-fill"
          className={[
            "absolute inset-y-0 left-0 rounded-full",
            hue.bar,
            "transition-[width] duration-700 ease-pop motion-reduce:transition-none",
            "motion-safe:animate-[quota-bar-grow_900ms_cubic-bezier(0.16,1,0.3,1)]",
          ].join(" ")}
          style={{ width: `${width}%` }}
        />
      ) : null}
    </div>
  );
}

/**
 * 渐变环形图。描边先停在 0，挂载后下一帧再给目标值，借 stroke-dashoffset 的过渡从 0 转到位；
 * 之后数值变化同样平滑过去。末端一圈同色柔光，让主角环在一片白卡片里跳出来。
 */
export function GradientRing({
  value,
  hue,
  className,
  strokeWidth = 10,
  children,
}: {
  value: number;
  hue: HueStyle;
  className: string;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  // useId 的返回值带冒号等字符，放进 url(#…) 会解析失败，只留安全字符。
  const gradientId = `cp-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const size = 120;
  const radius = (size - strokeWidth) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.min(Math.max(value, 0), 100);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setShown(target));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      if (inner) window.cancelAnimationFrame(inner);
    };
  }, [target]);

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hue.ring[0]} />
            <stop offset="100%" stopColor={hue.ring[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          className="transition-[stroke-dashoffset] duration-[1100ms] ease-pop motion-reduce:transition-none"
          style={{ filter: `drop-shadow(0 0 6px ${hue.ring[1]}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
