/**
 * 紧凑数字：1234 → 1.2k，60625 → 60.6k。和监控中心同一种写法，但功能模块之间不能互相引用，
 * 所以这里自带一份。
 */
export const formatCompact = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  const compact = (divisor: number, suffix: string) => {
    const fixed = (value / divisor).toFixed(1);
    return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}${suffix}`;
  };
  if (abs >= 1_000_000_000) return compact(1_000_000_000, "b");
  if (abs >= 1_000_000) return compact(1_000_000, "m");
  if (abs >= 1_000) return compact(1_000, "k");
  return Math.round(value).toLocaleString();
};
