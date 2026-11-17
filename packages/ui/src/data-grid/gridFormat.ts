/**
 * 表格单元格里的数字、耗时、金额、时间的统一写法。
 *
 * 各页面以前各写一套：同是 token 数，有的写 105,677、有的写 105.7K、有的写 0.1M；
 * 耗时有 8460ms、8.46s、「1m 60s」（秒数四舍五入进位没处理）几种写法。这里收成一份：
 * - 单元格里给「扫一眼能比大小」的短写法，精确值放 tooltip；
 * - 紧凑写法手写而不用 Intl 的 compact：不同 ICU 版本会把 4000 写成 4K 或 4.0K（本机和 CI
 *   的 Node 曾因此结果不同），手写保证同一个数字到处长一样。
 */

const UNITS = [
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
] as const;

const trimZeros = (text: string) => (text.includes(".") ? text.replace(/\.?0+$/, "") : text);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** 千分位整数：1,354。 */
export function formatInteger(value: number | null | undefined, locale?: string): string {
  if (!isFiniteNumber(value)) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

/**
 * 紧凑数：一万以下照写（9,876），以上保留三位有效数字（10.5K、106K、2.44M）。
 * 一万以下不缩写，是因为表格里大量是几百到几千的数，缩成 1.4K 反而丢了「比大小」需要的精度。
 */
export function formatCompactNumber(value: number | null | undefined, locale?: string): string {
  if (!isFiniteNumber(value)) return "—";
  const abs = Math.abs(value);
  if (abs < 10_000) return formatInteger(value, locale);
  const sign = value < 0 ? "-" : "";
  for (let index = 0; index < UNITS.length; index += 1) {
    const unit = UNITS[index];
    if (abs < unit.value) continue;
    const scaled = abs / unit.value;
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    const rounded = Number(scaled.toFixed(digits));
    // 四舍五入后进位成 1000K 时换到上一档单位：999,960 写成 1M 而不是 1000K。
    if (rounded >= 1000 && index > 0) {
      const bigger = UNITS[index - 1];
      return `${sign}${trimZeros((abs / bigger.value).toFixed(2))}${bigger.suffix}`;
    }
    return `${sign}${trimZeros(rounded.toFixed(digits))}${unit.suffix}`;
  }
  return formatInteger(value, locale);
}

/** 比例（0–1）写成百分比：73.7%；不到 0.1% 但非零写成 <0.1%，不让小比例看起来像 0。 */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (!isFiniteNumber(ratio)) return "—";
  const percent = ratio * 100;
  const floor = 10 ** -digits;
  if (percent > 0 && percent < floor) return `<${floor}%`;
  return `${trimZeros(percent.toFixed(digits))}%`;
}

/**
 * 耗时：820ms、8.46s、14.3s、1m 12s、1h 02m。
 * 先按显示精度取整再拆分分秒，避免 59.6 秒被写成「0m 60s」或 119.7 秒写成「1m 60s」。
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (!isFiniteNumber(ms) || ms < 0) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${trimZeros(seconds.toFixed(2))}s`;
  if (seconds < 59.95) return `${trimZeros(seconds.toFixed(1))}s`;
  const totalSeconds = Math.round(seconds);
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const rest = totalSeconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

/**
 * 金额（美元）：不到 1 美元保留四位（$0.0110，单次请求的费用通常在这个量级），
 * 1 美元以上两位；非零但小于 $0.0001 写成 <$0.0001。
 */
export function formatUsd(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs < 0.0001) return `${sign}<$0.0001`;
  if (abs < 1) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 生成速度：108 tok/s；没有输出或耗时为零时返回 null，单元格显示「—」。 */
export function tokensPerSecond(outputTokens: number, generationMs: number): number | null {
  if (!isFiniteNumber(outputTokens) || !isFiniteNumber(generationMs)) return null;
  if (outputTokens <= 0 || generationMs <= 0) return null;
  return outputTokens / (generationMs / 1000);
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** 24 小时制的时分秒：19:53:13（表格里时间列的主行，等宽对齐）。 */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** 完整时间：2026-11-17 19:53:13（tooltip 与导出用）。 */
export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${formatClock(ms)}`;
}

/** 两个时间戳是否同一个本地日。 */
export function isSameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** 相对时间：「3 分钟前」「2 小时前」「昨天」，用 Intl.RelativeTimeFormat 按语言输出。 */
export function formatRelativeTime(ms: number, now: number, locale?: string): string {
  const diffSeconds = Math.round((ms - now) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 45 * 60) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  return rtf.format(Math.round(diffSeconds / 86400), "day");
}
