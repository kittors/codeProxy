import { useEffect, useState, type FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BRAND_NAME, LogoMark } from "@code-proxy/assets";

export type PageLoaderVariant = "initial" | "restoring" | "inline";

interface PageLoaderProps {
  variant?: PageLoaderVariant;
  /** Only used for initial/restoring variants. Inline ignores this. */
  text?: string;
}

/** Shared page loader with three visual modes.
 *
 * - `initial`: full-screen brand loader for the very first render (before React hydrates).
 * - `restoring`: full-screen brand loader for auth restoration (e.g. checking session).
 * - `inline`: lightweight inline spinner for Suspense fallback / Card overlays.
 *
 * Usage in React mounts (routes, auth checks):
 * ```tsx
 * <PageLoader variant="restoring" />
 * <PageLoader variant="inline" />
 * ```
 *
 * For the HTML pre-hydration loader, the same visual is rendered as plain HTML in
 * `index.html` / `manage.html`.  When the React root mounts it calls `dismissAppLoader()`
 * which removes the HTML loader; from that point on the React `PageLoader` handles
 * all subsequent loading states.
 */
export const PageLoader: FC<PageLoaderProps> = ({
  variant = "initial",
  text,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (variant === "inline") {
    return (
      <span
        role="status"
        aria-label={text ?? "Loading"}
        className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-ink/15 border-t-ink motion-reduce:animate-none motion-safe:animate-spin"
      />
    );
  }

  const label = text ?? BRAND_NAME;

  return (
    <AnimatePresence>
      {mounted && (
        <motion.div
          key="page-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center"
          style={{
            background: "var(--pl-bg)",
          }}
        >
          {/* 品牌内容：一个细环 + 品牌名。不铺光斑、不做呼吸缩放，加载态只需要说明「还在进行」 */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative z-10 flex flex-col items-center"
          >
            <div className="relative mb-5 flex h-12 w-12 items-center justify-center">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: "var(--pl-ring-track)" }}
              />
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-transparent"
                style={{ borderTopColor: "var(--pl-ring)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
              <span aria-hidden="true" className="flex items-center justify-center">
                <LogoMark size={20} />
              </span>
            </div>

            <span
              role="status"
              aria-label={label}
              className="text-sm font-medium"
              style={{ color: "var(--pl-text)" }}
            >
              {label}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
