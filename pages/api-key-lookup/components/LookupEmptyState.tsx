import { useReducedMotion, motion } from "framer-motion";
import { BarChart3, ScrollText, Store } from "lucide-react";
import { ClaudeLogo, GeminiLogo, OpenAILogo, VertexLogo } from "@code-proxy/assets";
import { Button } from "@code-proxy/ui";

const ease = [0.16, 1, 0.3, 1] as const;

export function LookupEmptyState({
  t,
  onLogin,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  onLogin: () => void;
}) {
  const reduceMotion = useReducedMotion();

  const features = [
    {
      icon: BarChart3,
      title: t("apikey_lookup.landing_feature_usage_title", { defaultValue: "用量" }),
      desc: t("apikey_lookup.landing_feature_usage_desc", {
        defaultValue: "请求、Token 与费用趋势",
      }),
      tint: "from-sky-500/15 to-cyan-400/5 text-sky-700 dark:from-sky-400/20 dark:to-cyan-400/5 dark:text-sky-200",
    },
    {
      icon: ScrollText,
      title: t("apikey_lookup.landing_feature_logs_title", { defaultValue: "日志" }),
      desc: t("apikey_lookup.landing_feature_logs_desc", {
        defaultValue: "筛选与回看请求详情",
      }),
      tint: "from-violet-500/15 to-fuchsia-400/5 text-violet-700 dark:from-violet-400/20 dark:to-fuchsia-400/5 dark:text-violet-200",
    },
    {
      icon: Store,
      title: t("apikey_lookup.landing_feature_models_title", { defaultValue: "模型" }),
      desc: t("apikey_lookup.landing_feature_models_desc", {
        defaultValue: "可用模型与价格",
      }),
      tint: "from-teal-500/15 to-emerald-400/5 text-teal-700 dark:from-teal-400/20 dark:to-emerald-400/5 dark:text-teal-200",
    },
  ] as const;

  const providerLogos = [OpenAILogo, GeminiLogo, ClaudeLogo, VertexLogo] as const;

  const fadeUp = (delay = 0) =>
    reduceMotion
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 14, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.55, delay, ease },
        };

  return (
    <div data-testid="apikey-lookup-landing" className="relative w-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_60%)]"
      />

      <section className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-screen-xl flex-col justify-center px-5 py-16 sm:px-8 lg:px-10">
        <motion.div {...fadeUp(0.02)} className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t("apikey_lookup.landing_badge", { defaultValue: "统一入口 · 可观测" })}
          </div>

          <h1 className="text-balance text-4xl font-semibold leading-[1.06] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            <span className="block">
              {t("apikey_lookup.landing_title_line1", { defaultValue: "一个入口" })}
            </span>
            <span className="mt-1 block bg-gradient-to-r from-slate-900 via-sky-700 to-teal-600 bg-clip-text text-transparent dark:from-white dark:via-sky-200 dark:to-teal-200">
              {t("apikey_lookup.landing_title_line2", { defaultValue: "接入多模型能力" })}
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-sm leading-7 text-slate-600 dark:text-white/60 sm:text-base">
            {t("apikey_lookup.landing_desc", {
              defaultValue: "管理 API Key，查看用量与请求日志，浏览模型广场。",
            })}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              variant="primary"
              onClick={onLogin}
              className="h-11 rounded-full px-6 text-sm font-semibold shadow-[0_10px_30px_-12px_rgba(15,23,42,0.45)] transition-[transform,box-shadow] duration-200 ease-out active:scale-[0.97] hover:shadow-[0_16px_36px_-14px_rgba(15,23,42,0.5)]"
            >
              {t("apikey_lookup.landing_cta", { defaultValue: "登录" })}
            </Button>

            <div className="flex items-center gap-2">
              {providerLogos.map((Logo, index) => (
                <motion.span
                  key={index}
                  {...fadeUp(0.12 + index * 0.05)}
                  whileHover={reduceMotion ? undefined : { y: -3, scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/90 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <Logo size={20} />
                </motion.span>
              ))}
            </div>
          </div>
        </motion.div>

        <ul className="relative mt-16 grid max-w-4xl gap-3 sm:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.li
                key={feature.title}
                {...fadeUp(0.18 + index * 0.07)}
                whileHover={
                  reduceMotion
                    ? undefined
                    : { y: -4, transition: { type: "spring", stiffness: 380, damping: 24 } }
                }
                className="group rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200 hover:border-slate-300 hover:bg-white hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.05]"
              >
                <div
                  className={[
                    "mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br",
                    feature.tint,
                  ].join(" ")}
                >
                  <Icon
                    size={17}
                    strokeWidth={1.75}
                    className="transition-transform duration-200 group-hover:scale-110"
                    aria-hidden
                  />
                </div>
                <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                  {feature.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-white/50">
                  {feature.desc}
                </p>
              </motion.li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
