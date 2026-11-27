import { VendorIcon } from "@code-proxy/assets";
import { usePrefersReducedMotion } from "@code-proxy/ui";
import { LANDING_EASE_CSS, useLandingReveal } from "./landingMotion";
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
 */
export function LandingConsole({ copy }: { copy: LandingCopy }) {
  const reduceMotion = usePrefersReducedMotion();
  const { ref, style, shown } = useLandingReveal<HTMLDivElement>({
    delay: 0.25,
    distance: 32,
    duration: 0.75,
    immediate: true,
  });

  return (
    <div className="relative mt-20 lg:mt-28">
      <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-8 lg:px-10">
        <div
          ref={ref}
          style={style}
          className="overflow-hidden rounded-t-3xl bg-white shadow-[inset_0_1px_0_var(--sn-line),inset_1px_0_0_var(--sn-line),inset_-1px_0_0_var(--sn-line)] dark:bg-[#0C0C10]"
        >
          <div>
            <div className="flex items-center justify-between gap-2 px-5 py-3.5">
              <span className="font-display text-2xs font-medium uppercase tracking-[0.12em] text-sn-label3">
                {copy.console.title}
              </span>
              <span className="sn-tag sn-ok !h-5 !text-2xs" aria-hidden="true">
                Live
              </span>
            </div>

            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
              <div>
                <ul className="flex flex-wrap gap-x-10 gap-y-4">
                  {copy.console.kpis.map((kpi) => (
                    <li key={kpi.label}>
                      <p className="font-display text-2xs uppercase tracking-[0.1em] text-sn-label3">
                        {kpi.label}
                      </p>
                      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-sn-label">
                        {kpi.value}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex h-40 items-end gap-1.5" aria-hidden>
                  {BARS.map((height, index) => (
                    <span
                      key={index}
                      style={{
                        height: reduceMotion || shown ? `${height}%` : "0%",
                        transition: reduceMotion
                          ? undefined
                          : `height 0.7s ${LANDING_EASE_CSS} ${0.4 + index * 0.04}s`,
                      }}
                      className={`flex-1 rounded-t-sm ${index === BARS.length - 1 ? "bg-blue-500 dark:bg-blue-400 colorful:bg-gradient-to-t colorful:from-blue-500 colorful:to-indigo-400" : "bg-blue-500/25 dark:bg-blue-400/25 colorful:bg-transparent colorful:bg-gradient-to-t colorful:from-blue-500/35 colorful:to-blue-400/15 colorful:dark:from-blue-400/40 colorful:dark:to-blue-400/15"}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="font-display text-2xs uppercase tracking-[0.1em] text-sn-label3">
                  {copy.console.logsTitle}
                </p>
                <ul className="mt-4">
                  {SAMPLE_ROWS.map((row) => (
                    <li
                      key={row.model}
                      className="flex items-center gap-3 border-b border-sn-line py-3 last:border-b-0"
                    >
                      <VendorIcon modelId={row.model} size={16} />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-sn-label2">
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
                      <span className="w-14 text-right font-mono text-xs text-sn-label3">
                        {row.latency}
                      </span>
                      <span className="hidden w-12 text-right font-mono text-xs text-sn-label3 sm:block">
                        {row.tokens}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
