import { useCallback, useEffect, useRef } from "react";
import { NumberFlow, useSatin } from "satin-ui/react";

/**
 * 基于 Satin `<NumberFlow />` 的逐位滚动数字展示：
 * - 只滚动发生变化的数位（增大向上、减小向下，个位起 30ms 级联）；
 * - 位数增减时新位平滑展开、旧位平滑收起，逗号/小数点/单位稳住不乱跳；
 * - 尊重系统减少动态效果设置，并保留完整的 `aria-label` 与读屏文本。
 */
export function AnimatedNumber({
  value,
  format,
  style = "roll",
  className,
}: {
  value: number;
  format: (value: number) => string;
  /** 保留兼容旧调用签名；Satin NumberFlow 由位差自动计算物理节奏。 */
  durationMs?: number;
  style?: "roll" | "blur" | "push" | "fade";
  className?: string;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatRef = useRef(format);
  formatRef.current = format;
  const flowRef = useSatin();
  const stableFormat = useCallback((v: number) => formatRef.current(v), []);
  const formattedLabel = format(safeValue);
  const prevFormattedRef = useRef(formattedLabel);

  // 当 format 函数输出规则变化（例如切换货币/语言/精度）而 value 未变时，同步刷新显示。
  useEffect(() => {
    if (prevFormattedRef.current !== formattedLabel) {
      prevFormattedRef.current = formattedLabel;
      const inst = flowRef.current as
        | { set?: (v: number, opts?: { instant?: boolean }) => void }
        | null;
      inst?.set?.(safeValue, { instant: true });
    }
  }, [flowRef, formattedLabel, safeValue]);

  const mergedClassName = ["inline-flex items-baseline tabular-nums", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={mergedClassName} aria-label={formattedLabel}>
      <NumberFlow ref={flowRef} value={safeValue} format={stableFormat} effect={style} />
    </span>
  );
}
