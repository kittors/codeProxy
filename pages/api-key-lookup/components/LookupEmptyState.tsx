import { BarChart3, ScrollText, Store } from "lucide-react";
import { ClaudeLogo, GeminiLogo, OpenAILogo, VertexLogo } from "@code-proxy/assets";
import { Button } from "@code-proxy/ui";

export function LookupEmptyState({
  t,
  onLogin,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  onLogin: () => void;
}) {
  const features = [
    {
      icon: BarChart3,
      title: t("apikey_lookup.landing_feature_usage_title", { defaultValue: "用量" }),
      desc: t("apikey_lookup.landing_feature_usage_desc", {
        defaultValue: "请求、Token 与费用趋势",
      }),
    },
    {
      icon: ScrollText,
      title: t("apikey_lookup.landing_feature_logs_title", { defaultValue: "日志" }),
      desc: t("apikey_lookup.landing_feature_logs_desc", {
        defaultValue: "筛选与回看请求详情",
      }),
    },
    {
      icon: Store,
      title: t("apikey_lookup.landing_feature_models_title", { defaultValue: "模型" }),
      desc: t("apikey_lookup.landing_feature_models_desc", {
        defaultValue: "可用模型与价格",
      }),
    },
  ] as const;

  const providerLogos = [OpenAILogo, GeminiLogo, ClaudeLogo, VertexLogo] as const;

  return (
    <div data-testid="apikey-lookup-landing" className="w-full">
      <section className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-screen-xl flex-col justify-center px-5 py-16 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            {t("apikey_lookup.landing_title_line1", { defaultValue: "一个入口" })}
            <br />
            {t("apikey_lookup.landing_title_line2", { defaultValue: "接入多模型能力" })}
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-sm leading-7 text-slate-600 dark:text-white/60 sm:text-base">
            {t("apikey_lookup.landing_desc", {
              defaultValue: "管理 API Key，查看用量与请求日志，浏览模型广场。",
            })}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              onClick={onLogin}
              className="h-11 rounded-full px-6 text-sm font-semibold"
            >
              {t("apikey_lookup.landing_cta", { defaultValue: "登录" })}
            </Button>
            <div className="flex items-center gap-2 pl-1">
              {providerLogos.map((Logo, index) => (
                <span
                  key={index}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-white/5"
                >
                  <Logo size={20} />
                </span>
              ))}
            </div>
          </div>
        </div>

        <ul className="mt-16 grid max-w-4xl gap-3 sm:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <li
                key={feature.title}
                className="rounded-2xl border border-slate-200/80 bg-white/60 px-4 py-4 dark:border-white/[0.08] dark:bg-white/[0.03]"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80">
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                </div>
                <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                  {feature.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-white/50">
                  {feature.desc}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
