import { useId } from "react";

/**
 * 迷你趋势线（纯 SVG）。指标卡和三张排行表加起来有三十多条，每条一个 echarts 实例太重，
 * 这里只画一条平滑线 + 同色渐隐面积；有失败的点在底部画一道红色短柱，失败尖峰一眼可见。
 *
 * viewBox 横向拉伸（preserveAspectRatio="none"），线宽用 non-scaling-stroke 保持不变。
 * 首次出现时从左到右展开（monitor-sparkline-reveal），系统要求减少动态效果时直接显示。
 *
 * 量（请求、Token、费用）从 0 起画，看的是多少；比率与耗时用 baseline="auto"，从序列最小值
 * 起画——成功率在 98%–100% 之间的起伏，按 0–100 的刻度画出来就是一条直线。
 */
export function MonitorSparkline({
  values,
  failed,
  color,
  className = "h-9 w-full",
  label,
  baseline = "zero",
}: {
  values: readonly number[];
  failed?: readonly number[];
  color: string;
  className?: string;
  /** 读屏文字；不传则视为装饰。 */
  label?: string;
  baseline?: "zero" | "auto";
}) {
  const gradientId = `monitor-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const count = values.length;
  const width = 100;
  const height = 32;
  const peak = Math.max(...values, 0);
  const floor = baseline === "auto" ? Math.min(...values) : 0;
  const span = peak - floor;
  // 自适应下限留出 15% 的底边，线不会贴着卡片底；整条线都一样时画在中间。
  const low = baseline === "auto" ? floor - span * 0.15 : 0;
  const high = baseline === "auto" ? peak : Math.max(1, peak);
  const max = Math.max(1, peak);

  if (count < 2) {
    // 只有一个点（比如旧后端的「今天」只有一个日桶）画不出趋势，只留一条淡基线。
    return (
      <div className={`${className} flex items-end`} aria-hidden="true">
        <span className="h-px w-full bg-line" />
      </div>
    );
  }

  const points = values.map((value, index) => ({
    x: count === 1 ? width / 2 : (index / (count - 1)) * width,
    // 顶部留 3 个单位给线宽与圆角，底部贴住基线。
    y:
      high - low <= 0
        ? height / 2
        : height - ((Math.max(low, value) - low) / (high - low)) * (height - 4) - 1,
  }));
  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const barWidth = Math.max(0.6, Math.min(2.2, (width / count) * 0.55));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`${className} overflow-visible motion-safe:animate-[monitor-sparkline-reveal_900ms_cubic-bezier(0.16,1,0.3,1)]`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.26} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {(failed ?? []).map((value, index) => {
        if (!(value > 0) || !points[index]) return null;
        // 失败按与请求同一刻度画；零星失败（看不见、且不到该时段 5%）不画，免得满底红点。
        const barHeight = (value / max) * (height - 4);
        const share = value / Math.max(1, values[index] ?? 0);
        if (barHeight < 1.5 && share < 0.05) return null;
        const drawn = Math.max(1.5, barHeight);
        return (
          <rect
            key={index}
            x={points[index].x - barWidth / 2}
            y={height - drawn}
            width={barWidth}
            height={drawn}
            rx={0.6}
            className="fill-rose-500/80 dark:fill-rose-400/80"
          />
        );
      })}
    </svg>
  );
}

/** 单调三次插值的简化版：控制点取相邻点的中点斜率，不会冲过数据点形成假波峰。 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x - 1} ${p.y} L ${p.x + 1} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) / 2;
    d += ` C ${p0.x + dx} ${p0.y}, ${p1.x - dx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}
