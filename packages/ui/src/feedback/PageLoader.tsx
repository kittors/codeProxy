import { useEffect, useState, type FC } from "react";
import { createPortal } from "react-dom";
import { Loader } from "satin-ui/react";
import { BRAND_NAME, LogoMark } from "@code-proxy/assets";

export type PageLoaderVariant = "initial" | "restoring" | "inline";

interface PageLoaderProps {
  variant?: PageLoaderVariant;
  /** Only used for initial/restoring variants. Inline uses this as aria-label. */
  text?: string;
}

/**
 * 基于 Satin `<Loader />` 的统一加载器：
 * - `inline`：Satin `arc` 可变弧长呼吸旋环（SVG 矢量圆头）；
 * - `initial` / `restoring`：全屏品牌加载态，组合 Satin `matrix` 3×3 对角波纹点阵与品牌标识，
 *   去除冗余的 framer-motion 与旧边框转圈。
 */
export const PageLoader: FC<PageLoaderProps> = ({ variant = "initial", text }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (variant === "inline") {
    return (
      <Loader
        variant="arc"
        size={20}
        label={text ?? "Loading"}
        className="text-[var(--sn-label)]"
      />
    );
  }

  if (!mounted) return null;

  const label = text ?? BRAND_NAME;

  // 全屏态挂到 body 上，避免被带滚动渐隐遮罩的主内容区裁切。
  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center transition-opacity duration-300 ease-out"
      style={{ background: "var(--sn-canvas, var(--pl-bg))" }}
    >
      <div className="sn-fade-up relative z-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 text-[var(--sn-label)]">
          <LogoMark size={22} />
          <Loader variant="matrix" size={22} label={label} />
        </div>
        <span
          className="sn-t-callout sn-c-secondary font-medium"
          style={{ color: "var(--sn-label2, var(--pl-text))" }}
        >
          {label}
        </span>
      </div>
    </div>,
    document.body,
  );
};
