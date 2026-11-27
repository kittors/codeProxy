import { useEffect, useRef, type PropsWithChildren } from "react";
import { requestScrollFadeMeasure } from "../hooks/scrollFadeDom";

/**
 * Satin 轻量内容渐入容器（纯合成线程 `.sn-fade-up`，零 framer-motion）：
 * 进场落定后通知外层 ScrollFade 重新量高度，避免恰好填满一屏的页面底部残余渐隐。
 */
export function Reveal({
  children,
  className,
}: PropsWithChildren<{
  className?: string;
}>) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => requestScrollFadeMeasure(ref.current), 340);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      ref={ref}
      onAnimationEnd={() => requestScrollFadeMeasure(ref.current)}
      className={["sn-fade-up", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
