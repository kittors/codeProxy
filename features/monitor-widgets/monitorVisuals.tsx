import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { StatusTag, type StatusTagTone } from "@code-proxy/ui";
import type { SatinIconComponent } from "@code-proxy/ui/icons";

/**
 * 监控类页面共享的视觉零件（仪表盘的系统监控、运行观测的监控中心）：占用配色、指标图标、
 * 环形图、进度条、状态标签。放在 feature 里而不是某个页面下，是因为页面之间不能互相引用。
 *
 * 遥测可视化与顶部趋势折线图统一采用清晰的分类语义色（不随默认简约模式退化为纯黑白）：
 * - emerald：健康、网络上行、运行时间（「一切正常」的颜色）
 * - sky：CPU、磁盘、数据库、网络下行（算力与存储）
 * - violet：内存、协程（运行时）
 * - amber：日志；监控中心里是费用；以及 ≥80% 警告覆盖色
 * - indigo：耗时、WAL 与首字时间
 * - rose：≥95% 告急 / 风险态专用
 * 告警态（≥80% 琥珀、≥95% 红）始终覆盖分类色，确保异常指标第一时间跃出。
 * 简约模式下使用纯实色与无底盒彩色矢量图标；开启 colorful / icon-hue 外观时平滑叠加强化渐变与图标块。
 */

export type MonitorHue = "emerald" | "sky" | "violet" | "amber" | "indigo" | "rose";

type HueStyle = {
  /** 多彩图标块的淡底与图标色（图标块只在图标着色为多彩时出现，见 MetricIcon）。 */
  tile: string;
  glyph: string;
  /** 基础实色条与底槽（默认启用多彩语义，无发光与装饰噪音）。 */
  solidBar: string;
  solidTrack: string;
  /** 环形图基础实色描边。 */
  solidRing: string;
  /** 叠在基础填充 / 底槽上的渐变与淡底（colorful: 变体类）。 */
  bar: string;
  track: string;
  /** 环形图渐变的两端（SVG stop-color 只认颜色值）。 */
  ring: readonly [string, string];
};

export const MONITOR_HUES: Record<MonitorHue, HueStyle> = {
  emerald: {
    tile: "bg-emerald-500/10 dark:bg-emerald-400/15",
    glyph: "text-emerald-600 dark:text-emerald-400",
    solidBar: "bg-emerald-500 dark:bg-emerald-400",
    solidTrack: "bg-emerald-500/12 dark:bg-emerald-400/15",
    solidRing: "stroke-emerald-500 dark:stroke-emerald-400",
    bar: "colorful:bg-gradient-to-r colorful:from-emerald-400 colorful:to-teal-500",
    track: "colorful:bg-emerald-500/12 colorful:dark:bg-emerald-400/15",
    ring: ["#34d399", "#14b8a6"],
  },
  sky: {
    tile: "bg-sky-500/10 dark:bg-sky-400/15",
    glyph: "text-sky-600 dark:text-sky-400",
    solidBar: "bg-sky-500 dark:bg-sky-400",
    solidTrack: "bg-sky-500/12 dark:bg-sky-400/15",
    solidRing: "stroke-sky-500 dark:stroke-sky-400",
    bar: "colorful:bg-gradient-to-r colorful:from-sky-400 colorful:to-blue-500",
    track: "colorful:bg-sky-500/12 colorful:dark:bg-sky-400/15",
    ring: ["#38bdf8", "#3b82f6"],
  },
  violet: {
    tile: "bg-violet-500/10 dark:bg-violet-400/15",
    glyph: "text-violet-600 dark:text-violet-400",
    solidBar: "bg-violet-500 dark:bg-violet-400",
    solidTrack: "bg-violet-500/12 dark:bg-violet-400/15",
    solidRing: "stroke-violet-500 dark:stroke-violet-400",
    bar: "colorful:bg-gradient-to-r colorful:from-violet-400 colorful:to-purple-500",
    track: "colorful:bg-violet-500/12 colorful:dark:bg-violet-400/15",
    ring: ["#a78bfa", "#a855f7"],
  },
  amber: {
    tile: "bg-amber-500/10 dark:bg-amber-400/15",
    glyph: "text-amber-600 dark:text-amber-400",
    solidBar: "bg-amber-500 dark:bg-amber-400",
    solidTrack: "bg-amber-500/12 dark:bg-amber-400/15",
    solidRing: "stroke-amber-500 dark:stroke-amber-400",
    bar: "colorful:bg-gradient-to-r colorful:from-amber-300 colorful:to-orange-500",
    track: "colorful:bg-amber-500/12 colorful:dark:bg-amber-400/15",
    ring: ["#fcd34d", "#f97316"],
  },
  indigo: {
    tile: "bg-indigo-500/10 dark:bg-indigo-400/15",
    glyph: "text-indigo-600 dark:text-indigo-400",
    solidBar: "bg-indigo-500 dark:bg-indigo-400",
    solidTrack: "bg-indigo-500/12 dark:bg-indigo-400/15",
    solidRing: "stroke-indigo-500 dark:stroke-indigo-400",
    bar: "colorful:bg-gradient-to-r colorful:from-indigo-400 colorful:to-violet-500",
    track: "colorful:bg-indigo-500/12 colorful:dark:bg-indigo-400/15",
    ring: ["#818cf8", "#8b5cf6"],
  },
  /** 只给告急态用，不作为任何指标的分类色。 */
  rose: {
    tile: "bg-rose-500/10 dark:bg-rose-400/15",
    glyph: "text-rose-600 dark:text-rose-400",
    solidBar: "bg-rose-500 dark:bg-rose-400",
    solidTrack: "bg-rose-500/12 dark:bg-rose-400/15",
    solidRing: "stroke-rose-500 dark:stroke-rose-400",
    bar: "colorful:bg-gradient-to-r colorful:from-rose-400 colorful:to-red-500",
    track: "colorful:bg-rose-500/12 colorful:dark:bg-rose-400/15",
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

/** 文本告警档配色：正常档保持主墨色，仅警告 / 告急变色。 */
const LEVEL_TEXT: Record<UsageLevel, string> = {
  normal: "text-sn-label",
  warn: "text-amber-700 dark:text-amber-300",
  critical: "text-rose-600 dark:text-rose-300",
};

/** 某一档的配色：默认按指标分类着色，告警档（≥80% / ≥95%）自动覆盖成琥珀 / 红。 */
export function meterTone(level: UsageLevel, hue: MonitorHue = "emerald"): MeterTone {
  const resolvedHue: MonitorHue = level === "critical" ? "rose" : level === "warn" ? "amber" : hue;
  const palette = MONITOR_HUES[resolvedHue];
  return {
    bar: `${palette.solidBar} ${palette.bar}`,
    track: `${palette.solidTrack} ${palette.track}`,
    ring: palette.solidRing,
    ringStops: palette.ring,
    text: LEVEL_TEXT[level],
  };
}

/** 占用类指标的配色：按占用比例取档。 */
export const usageTone = (pct: number, hue?: MonitorHue): MeterTone => meterTone(usageLevel(pct), hue);

export const USAGE_LEVEL_LABEL_KEY: Record<UsageLevel, string> = {
  normal: "system_monitor.status_normal",
  warn: "system_monitor.status_warn",
  critical: "system_monitor.status_critical",
};

/** 正常态：简约风格是中性底配绿点，多彩风格叠加绿色文字与淡底；对齐 Satin `.sn-tag`。 */
const LEVEL_PILL: Record<UsageLevel, string> = {
  normal:
    "text-sn-label2 colorful:!bg-emerald-500/10 colorful:text-emerald-700 colorful:dark:!bg-emerald-400/15 colorful:dark:text-emerald-300",
  warn: "!bg-amber-500/10 text-amber-700 dark:!bg-amber-400/15 dark:text-amber-300",
  critical: "!bg-rose-500/10 text-rose-700 dark:!bg-rose-400/15 dark:text-rose-300",
};

const LEVEL_TAG_TONE: Record<UsageLevel, StatusTagTone> = {
  normal: "ok",
  warn: "warn",
  critical: "bad",
};

const LEVEL_DOT: Record<UsageLevel, string> = {
  normal: "bg-emerald-500 colorful:ring-4 colorful:ring-emerald-500/20",
  warn: "bg-amber-500 colorful:ring-4 colorful:ring-amber-500/20",
  critical: "bg-rose-500 colorful:ring-4 colorful:ring-rose-500/20",
};

export function LevelPill({ level, children }: { level: UsageLevel; children: ReactNode }) {
  return (
    <StatusTag size="sm" tone={LEVEL_TAG_TONE[level]} className={LEVEL_PILL[level]}>
      {children}
    </StatusTag>
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
 * 指标标题前的图标：默认用无底盒的分类色矢量图标（贴合监控遥测视觉，同时严守无灰方盒原则）；
 * 开启「图标着色 = 多彩」外观时切换为圆角同心底块。两种形态均由 <html data-icons> 控制，无需重渲。
 */
export function MetricIcon({ icon: Icon, hue }: { icon: SatinIconComponent; hue?: MonitorHue }) {
  if (!hue) return <Icon size={16} className="shrink-0 text-sn-label3" aria-hidden="true" />;
  const style = MONITOR_HUES[hue];
  return (
    <>
      <Icon size={16} className={`shrink-0 ${style.glyph} icon-hue:hidden`} aria-hidden="true" />
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
            "transition-[width] duration-700 ease-sn-strong motion-reduce:transition-none",
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
    "--sn-ring-paint": `url(#${gradientId})`,
    "--sn-ring-glow": `drop-shadow(0 0 6px ${tone.ringStops[1]}55)`,
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
          className="stroke-[var(--sn-fill-subtle)]"
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
          className={`${tone.ring} colorful:[stroke:var(--sn-ring-paint)] colorful:[filter:var(--sn-ring-glow)] transition-[stroke-dashoffset] duration-[1100ms] ease-sn-strong motion-reduce:transition-none`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
