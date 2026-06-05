import { useEffect, useMemo, useRef, useState } from "react";

const prefersReducedMotion = (): boolean => {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
};

export function AnimatedNumber({
  value,
  format,
  durationMs = 480,
  className,
}: {
  value: number;
  format: (value: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [animatedValue, setAnimatedValue] = useState(value);
  const animatedValueRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  const formatted = useMemo(() => format(animatedValue), [animatedValue, format]);

  useEffect(() => {
    animatedValueRef.current = animatedValue;
  }, [animatedValue]);

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setAnimatedValue(0);
      return;
    }

    if (prefersReducedMotion()) {
      setAnimatedValue(value);
      return;
    }

    const from = animatedValueRef.current;
    const to = value;

    if (from === to) {
      setAnimatedValue(to);
      return;
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (to - from) * eased;
      setAnimatedValue(next);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [durationMs, value]);

  const mergedClassName = ["inline-block tabular-nums", className].filter(Boolean).join(" ");

  return (
    <span className={mergedClassName} aria-label={format(value)}>
      {formatted}
    </span>
  );
}
