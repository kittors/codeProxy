import { type PropsWithChildren } from "react";
import { motion, useReducedMotion } from "framer-motion";

const revealEase = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  className,
}: PropsWithChildren<{
  className?: string;
}>) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
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
