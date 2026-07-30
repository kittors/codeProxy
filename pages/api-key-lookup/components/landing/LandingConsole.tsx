import { motion, useReducedMotion } from "framer-motion";
import { VendorIcon } from "@code-proxy/assets";
import { LANDING_EASE } from "./landingMotion";
import type { LandingCopy } from "./landingCopy";

/** 固定的柱高序列。刻意不用随机值：每次渲染形状一致，截图与视觉回归才可比。 */
const BARS = [34, 52, 41, 68, 57, 79, 63, 88, 71, 95, 74, 61, 83, 69] as const;

const SAMPLE_ROWS = [
  { model: "claude-sonnet-5", status: 200, latency: "412ms", tokens: "3.2k" },
  { model: "gemini-3-pro", status: 200, latency: "687ms", tokens: "5.8k" },
  { model: "gpt-5.2", status: 200, latency: "298ms", tokens: "1.4k" },
  { model: "grok-4.5", status: 429, latency: "—", tokens: "—" },
] as const;

/**
 * 首屏下方的产品预览板。
 *
 * 这是按真实面板结构复刻的示意，不是线上截图——落地页面向未登录访客，拿不到真实数据，
 * 所以用固定样例数据呈现界面结构，既能说明产品长什么样，也不会显示编造的经营指标。
 */
export function LandingConsole({ copy }: { copy: LandingCopy }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mt-20 lg:mt-28">
      <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-8 lg:px-10">
        <motion.div
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: LANDING_EASE }}
          // 强调色外框 + 深色面板：把预览板当成一个被「装裱」起来的产品实物。
          className="rounded-t-4xl bg-gradient-to-b from-indigo-600 to-indigo-600/0 p-1.5 pb-0 shadow-[0_-8px_80px_-30px_rgba(79,70,229,0.55)] dark:from-indigo-500 dark:to-indigo-500/0 dark:shadow-none"
        >
          {/* 底部不封口，面板向下溢出被视口裁掉，暗示「还有更多」。 */}
          <div className="overflow-hidden rounded-t-3xl bg-white dark:bg-[#0C0C10]">
            <div className="flex items-center gap-2 border-b border-slate-900/8 px-5 py-3.5 dark:border-white/8">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-white/15" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-white/15" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-white/15" aria-hidden />
              <span className="ml-3 font-display text-2xs uppercase tracking-[0.1em] text-slate-400 dark:text-white/35">
                {copy.console.title}
              </span>
            </div>

            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
              <div>
                <ul className="flex flex-wrap gap-x-10 gap-y-4">
                  {copy.console.kpis.map((kpi) => (
                    <li key={kpi.label}>
                      <p className="font-display text-2xs uppercase tracking-[0.1em] text-slate-400 dark:text-white/35">
                        {kpi.label}
                      </p>
                      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {kpi.value}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex h-40 items-end gap-1.5" aria-hidden>
                  {BARS.map((height, index) => (
                    <motion.span
                      key={index}
                      initial={reduceMotion ? { height: `${height}%` } : { height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{
                        duration: 0.7,
                        // 逐根起跳形成从左到右的扫过感，比整体一起长出来更有节奏。
                        delay: 0.5 + index * 0.045,
                        ease: LANDING_EASE,
                      }}
                      className="flex-1 rounded-t-sm bg-gradient-to-t from-indigo-600/25 to-indigo-600 dark:from-indigo-500/20 dark:to-indigo-400"
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="font-display text-2xs uppercase tracking-[0.1em] text-slate-400 dark:text-white/35">
                  {copy.console.logsTitle}
                </p>
                <ul className="mt-4">
                  {SAMPLE_ROWS.map((row) => (
                    <li
                      key={row.model}
                      className="flex items-center gap-3 border-b border-slate-900/8 py-3 last:border-b-0 dark:border-white/8"
                    >
                      <VendorIcon modelId={row.model} size={16} />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-white/70">
                        {row.model}
                      </span>
                      <span
                        className={[
                          "font-mono text-xs",
                          row.status === 200
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400",
                        ].join(" ")}
                      >
                        {row.status}
                      </span>
                      <span className="w-14 text-right font-mono text-xs text-slate-400 dark:text-white/35">
                        {row.latency}
                      </span>
                      <span className="hidden w-12 text-right font-mono text-xs text-slate-400 sm:block dark:text-white/35">
                        {row.tokens}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
