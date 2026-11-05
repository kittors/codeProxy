import { useRef, type PropsWithChildren } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { requestScrollFadeMeasure } from "../hooks/scrollFadeDom";

const revealEase = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  className,
}: PropsWithChildren<{
  className?: string;
}>) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <motion.div
      ref={ref}
      // 入场位移会让外层滚动区的 scrollHeight 短暂变大，而 transform 不触发 ResizeObserver：
      // 落定后请外层重新量一次，否则恰好填满一屏的页面底部会留着一条渐隐。
      onAnimationComplete={() => requestScrollFadeMeasure(ref.current)}
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={
        reduceMotion
          ? { duration: 0.12 }
          : { duration: 0.22, ease: revealEase, layout: { duration: 0.26, ease: revealEase } }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
