import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * 监控类页面共享的视觉零件（仪表盘的系统监控、运行观测的监控中心）：占用配色、指标图标、
 * 环形图、进度条、状态标签。放在 feature 里而不是某个页面下，是因为页面之间不能互相引用。
 *
 * 两套配色跟随「外观」设置（见 apps/admin-panel/src/styles/index.css 顶部的变体说明）：
 * - 简约（基础类）：只有「正常 / 留意 / 告急」三档——正常用强调色，≥80% 琥珀、≥95% 红，
 *   只有出问题的那张卡会变色；图标是线性图标，环和条是实色。
 * - 多彩（colorful: / icon-hue: 变体类，默认）：每类指标有固定的分类色，同一类指标在环、条、
 *   图标块上始终同色，避免满屏彩虹：
 *   - emerald：健康、网络、运行时间（「一切正常」的颜色）
 *   - sky：CPU、磁盘、数据库（算力与存储）
 *   - violet：内存、协程（运行时）
 *   - amber：日志；监控中心里是费用
 *   - indigo：耗时与首字时间
 *   告警态（≥80% 琥珀、≥95% 红）会覆盖分类色——那时用户需要看到的是「出问题了」而不是类别；
 *   rose 只给告急态用。环是同色系渐变加一圈柔光，条是同色系渐变、底槽是同色淡底。
 */

export type MonitorHue = "emerald" | "sky" | "violet" | "amber" | "indigo" | "rose";

type HueStyle = {
  /** 多彩图标块的淡底与图标色（图标块只在图标着色为多彩时出现，见 MetricIcon）。 */
  tile: string;
  glyph: string;
  /** 叠在基础填充 / 底槽上的渐变与淡底（colorful: 变体类）。 */
  bar: string;
  track: string;
  /** 环形图渐变的两端（SVG stop-color 只认颜色值）。 */
  ring: readonly [string, string];
};

export const MONITOR_HUES: Record<MonitorHue, HueStyle> = {
  emerald: {
    tile: "bg-emerald-500/10 dark:bg-emerald-400/15",
    glyph: "text-emerald-600 dark:text-emerald-300",
    bar: "colorful:bg-gradient-to-r colorful:from-emerald-400 colorful:to-teal-500",
    track: "colorful:bg-emerald-500/10 colorful:dark:bg-emerald-400/15",
    ring: ["#34d399", "#14b8a6"],
  },
  sky: {
    tile: "bg-sky-500/10 dark:bg-sky-400/15",
    glyph: "text-sky-600 dark:text-sky-300",
    bar: "colorful:bg-gradient-to-r colorful:from-sky-400 colorful:to-blue-500",
    track: "colorful:bg-sky-500/10 colorful:dark:bg-sky-400/15",
    ring: ["#38bdf8", "#3b82f6"],
  },
  violet: {
    tile: "bg-violet-500/10 dark:bg-violet-400/15",
    glyph: "text-violet-600 dark:text-violet-300",
    bar: "colorful:bg-gradient-to-r colorful:from-violet-400 colorful:to-purple-500",
    track: "colorful:bg-violet-500/10 colorful:dark:bg-violet-400/15",
    ring: ["#a78bfa", "#a855f7"],
  },
  amber: {
    tile: "bg-amber-500/10 dark:bg-amber-400/15",
    glyph: "text-amber-600 dark:text-amber-300",
    bar: "colorful:bg-gradient-to-r colorful:from-amber-300 colorful:to-orange-500",
    track: "colorful:bg-amber-500/10 colorful:dark:bg-amber-400/15",
    ring: ["#fcd34d", "#f97316"],
  },
  indigo: {
    tile: "bg-indigo-500/10 dark:bg-indigo-400/15",
    glyph: "text-indigo-600 dark:text-indigo-300",
    bar: "colorful:bg-gradient-to-r colorful:from-indigo-400 colorful:to-violet-500",
    track: "colorful:bg-indigo-500/10 colorful:dark:bg-indigo-400/15",
    ring: ["#818cf8", "#8b5cf6"],
  },
  /** 只给告急态用，不作为任何指标的分类色。 */
  rose: {
    tile: "bg-rose-500/10 dark:bg-rose-400/15",
    glyph: "text-rose-600 dark:text-rose-300",
    bar: "colorful:bg-gradient-to-r colorful:from-rose-400 colorful:to-red-500",
    track: "colorful:bg-rose-500/10 colorful:dark:bg-rose-400/15",
    ring: ["#fb7185", "#e11d48"],
  },
};

export type UsageLevel = "normal" | "warn" | "critical";

export const usageLevel = (pct: number): UsageLevel =>
  pct >= 95 ? "critical" : pct >= 80 ? "warn" : "normal";

/** 一档的配色：进度条填充与底槽、环形图描边（实色 + 多彩渐变两端）、强调文字。 */
export type MeterTone = {
  bar: string;
  track: string;
  ring: string;
  ringStops: readonly [string, string];
  text: string;
};

/** 简约风格的三档（基础类）。 */
const LEVEL_BASE: Record<UsageLevel, { bar: string; ring: string; text: string }> = {
  normal: { bar: "bg-accent", ring: "stroke-accent", text: "text-ink" },
  warn: {
    bar: "bg-amber-500 dark:bg-amber-400",
    ring: "stroke-amber-500 dark:stroke-amber-400",
    text: "text-amber-700 dark:text-amber-300",
  },
  critical: {
    bar: "bg-rose-500 dark:bg-rose-400",
    ring: "stroke-rose-500 dark:stroke-rose-400",
    text: "text-rose-600 dark:text-rose-300",
  },
};

/** 某一档的配色；正常档在多彩风格下用指标的分类色，告警档覆盖成琥珀 / 红。 */
export function meterTone(level: UsageLevel, hue: MonitorHue = "emerald"): MeterTone {
  const base = LEVEL_BASE[level];
  const colorful = MONITOR_HUES[level === "critical" ? "rose" : level === "warn" ? "amber" : hue];
  return {
    bar: `${base.bar} ${colorful.bar}`,
    track: `bg-track ${colorful.track}`,
    ring: base.ring,
    ringStops: colorful.ring,
    text: base.text,
  };
}

/** 占用类指标的配色：按占用比例取档。 */
export const usageTone = (pct: number, hue?: MonitorHue): MeterTone => meterTone(usageLevel(pct), hue);

export const USAGE_LEVEL_LABEL_KEY: Record<UsageLevel, string> = {
  normal: "system_monitor.status_normal",
  warn: "system_monitor.status_warn",
  critical: "system_monitor.status_critical",
};

/** 正常态：简约风格是中性的灰标签（「一切正常」不是需要注意的消息），多彩风格是绿色。 */
const LEVEL_PILL: Record<UsageLevel, string> = {
  normal:
    "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-500/10 colorful:text-emerald-700 colorful:dark:bg-emerald-400/15 colorful:dark:text-emerald-300",
  warn: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  critical: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

const LEVEL_DOT: Record<UsageLevel, string> = {
  normal: "bg-emerald-500 colorful:ring-4 colorful:ring-emerald-500/20",
  warn: "bg-amber-500 colorful:ring-4 colorful:ring-amber-500/20",
  critical: "bg-rose-500 colorful:ring-4 colorful:ring-rose-500/20",
};

export function LevelPill({ level, children }: { level: UsageLevel; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${LEVEL_PILL[level]}`}>
      {children}
    </span>
  );
}

/**
 * 状态小圆点。多彩风格外加一圈同色淡光晕；简约风格只有实心点——光晕是一块没有边界的淡色底，
 * 贴在圆角卡片的角落里时需要额外的视觉补偿，去掉后圆点和文字一样按内容对齐。
 */
export function LevelDot({ level, label }: { level: UsageLevel; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`size-2 shrink-0 rounded-full ${LEVEL_DOT[level]}`}
    />
  );
}

/**
 * 指标标题前的图标。图标着色为多彩时是分类色的圆角图标块，圆角取 rounded-inner（卡片圆角 −
 * 内边距），和卡片角同一个圆心；单色时只有线性图标，不再垫底块。两种形态都渲染，由
 * <html data-icons> 决定显示哪个，切换外观不需要重新渲染。
 */
export function MetricIcon({ icon: Icon, hue }: { icon: LucideIcon; hue?: MonitorHue }) {
  if (!hue) return <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />;
  const style = MONITOR_HUES[hue];
  return (
    <>
      <Icon size={16} className="shrink-0 text-ink-3 icon-hue:hidden" aria-hidden="true" />
      <span
        aria-hidden="true"
        className={`hidden size-8 shrink-0 place-items-center rounded-inner icon-hue:grid ${style.tile}`}
      >
        <Icon size={16} className={style.glyph} />
      </span>
    </>
  );
}

/**
 * 进度条：首次出现从 0 长到实际宽度（quota-bar-grow 关键帧），之后数值变化滑到新宽度。
 * 用 width 而不是 scaleX：缩放会把圆头一起压扁。粗细默认 h-bar（外观里可调）。
 */
export function MeterBar({ pct, tone, className = "h-bar" }: { pct: number; tone: MeterTone; className?: string }) {
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className={`relative w-full overflow-hidden rounded-full ${tone.track} ${className}`}>
      {width > 0 ? (
        <div
          data-testid="monitor-meter-fill"
          className={[
            "absolute inset-y-0 left-0 rounded-full",
            tone.bar,
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
 * 环形图。描边先停在 0，挂载后下一帧再给目标值，借 stroke-dashoffset 的过渡从 0 转到位；
 * 之后数值变化同样平滑过去。简约风格是实色描边；多彩风格换成同色系渐变，末端一圈同色柔光，
 * 让主角环在一片白卡片里跳出来。渐变的 url(#id) 每个实例不同，写不进类名，所以经行内的
 * CSS 变量交给 colorful: 变体类。
 */
export function MeterRing({
  value,
  tone,
  className,
  strokeWidth = 10,
  children,
}: {
  value: number;
  tone: MeterTone;
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

  const paint = {
    "--cp-ring-paint": `url(#${gradientId})`,
    "--cp-ring-glow": `drop-shadow(0 0 6px ${tone.ringStops[1]}55)`,
  } as CSSProperties;

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone.ringStops[0]} />
            <stop offset="100%" stopColor={tone.ringStops[1]} />
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
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={paint}
          className={`${tone.ring} colorful:[stroke:var(--cp-ring-paint)] colorful:[filter:var(--cp-ring-glow)] transition-[stroke-dashoffset] duration-[1100ms] ease-pop motion-reduce:transition-none`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
