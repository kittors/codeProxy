import { useEffect, useState, type FC } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
        className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-slate-300 border-t-slate-700 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/30 dark:border-t-white"
      />
    );
  }

  const label = text ?? "CLI Proxy";

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
          {/* Atmospheric glow blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="pl-glow pl-glow-1" />
            <div className="pl-glow pl-glow-2" />
            <div className="pl-glow pl-glow-3" />
          </div>

          {/* Brand content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* Spinner: two concentric rings */}
            <div className="relative mb-5 h-12 w-12">
              {/* Outer ring — slow, thick */}
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-[3px] border-transparent"
                style={{ borderTopColor: "var(--pl-ring-outer)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              />
              {/* Inner ring — fast, thin */}
              <motion.span
                aria-hidden="true"
                className="absolute inset-1 rounded-full border-[2px] border-transparent"
                style={{ borderTopColor: "var(--pl-ring-inner)" }}
                animate={{ rotate: -360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
            </div>

            {/* Brand text with breathing pulse */}
            <motion.span
              role="status"
              aria-label={label}
              className="text-sm font-medium tracking-widest"
              style={{ color: "var(--pl-text)" }}
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {label}
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
