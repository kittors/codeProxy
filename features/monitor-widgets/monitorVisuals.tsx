import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * 监控类页面共享的视觉零件（仪表盘的系统监控、运行观测的监控中心）：占用配色、指标图标、
 * 环形图、进度条、状态标签。放在 feature 里而不是某个页面下，是因为页面之间不能互相引用。
 *
 * 配色只有「正常 / 留意 / 告急」三档：正常用全站唯一的强调色，≥80% 琥珀、≥95% 红。
 * 以前按指标类别分五个色系（网络绿、CPU 天蓝、内存紫、日志琥珀、耗时靛蓝），每张卡一个
 * 彩色图标块 + 渐变环 + 渐变条，系统监控一屏同时出现五六种颜色——颜色不再表达「出没出
 * 问题」，用户反而要逐张读数字。现在只有出问题的那张卡会变色。
 */

export type UsageLevel = "normal" | "warn" | "critical";

export const usageLevel = (pct: number): UsageLevel =>
  pct >= 95 ? "critical" : pct >= 80 ? "warn" : "normal";

/** 一档的配色：进度条填充、环形图描边、强调文字。 */
export type MeterTone = {
  bar: string;
  ring: string;
  text: string;
};

export const METER_TONES: Record<UsageLevel, MeterTone> = {
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

/** 占用类指标的配色：按占用比例取档。 */
export const usageTone = (pct: number): MeterTone => METER_TONES[usageLevel(pct)];

export const USAGE_LEVEL_LABEL_KEY: Record<UsageLevel, string> = {
  normal: "system_monitor.status_normal",
  warn: "system_monitor.status_warn",
  critical: "system_monitor.status_critical",
};

/** 正常态是中性的灰标签：「一切正常」不是需要注意的消息，颜色留给留意和告急。 */
const LEVEL_PILL: Record<UsageLevel, string> = {
  normal: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  warn: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  critical: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

const LEVEL_DOT: Record<UsageLevel, string> = {
  normal: "bg-emerald-500",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
};

export function LevelPill({ level, children }: { level: UsageLevel; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${LEVEL_PILL[level]}`}>
      {children}
    </span>
  );
}

/**
 * 状态小圆点：只有实心点，不加同色光晕。光晕是一块没有边界的淡色底，贴在圆角卡片的角落里
 * 时，它和卡片圆角之间的距离读起来比文字离边更近，需要额外的视觉补偿；去掉光晕后圆点和
 * 文字一样按内容对齐。
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
 * 指标标题前的图标：只有线性图标，不再垫彩色底块。卡片里的图标块是「框里套框」的又一层，
 * 放在卡片角落时它的圆角和卡片圆角不同心，看着别扭（用户反馈的「四个圆角四个圆心」）。
 */
export function MetricIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />;
}

/**
 * 进度条：首次出现从 0 长到实际宽度（quota-bar-grow 关键帧），之后数值变化滑到新宽度。
 * 用 width 而不是 scaleX：缩放会把圆头一起压扁。实色填充、中性轨道，长短一眼可比。
 */
export function MeterBar({ pct, tone, className = "h-2" }: { pct: number; tone: MeterTone; className?: string }) {
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-track ${className}`}>
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
 * 之后数值变化同样平滑过去。实色描边、不加发光：颜色本身已经说明了档位。
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
          className={`${tone.ring} transition-[stroke-dashoffset] duration-[1100ms] ease-pop motion-reduce:transition-none`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
