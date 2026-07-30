import { motion } from "framer-motion";
import { useLandingFade } from "./landingMotion";

/**
 * 章节头：等宽序号 + 等宽 eyebrow + 大标题。
 *
 * 序号（01 / 02 / 03）是这版设计的节奏锚点——它让长页面读起来像一份有目录的文档，
 * 而不是一串互不相干的卡片区。
 */
export function LandingSectionHead({
  index,
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  index: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  const fade = useLandingFade();
  const centered = align === "center";

  return (
    <motion.div
      {...fade()}
      className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}
    >
      <div
        className={[
          "flex items-center gap-3 font-display text-2xs uppercase tracking-[0.28em]",
          centered ? "justify-center" : "",
        ].join(" ")}
      >
        <span className="text-indigo-600 dark:text-indigo-400">{index}</span>
        <span className="h-px w-8 bg-slate-900/15 dark:bg-white/15" aria-hidden />
        <span className="tracking-[0.1em] text-slate-400 dark:text-white/35">{eyebrow}</span>
      </div>

      <h2 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
        {title}
      </h2>

      {subtitle ? (
        <p className="mt-5 text-base leading-8 text-slate-600 dark:text-white/55">{subtitle}</p>
      ) : null}
    </motion.div>
  );
}
