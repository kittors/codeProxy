import { BarChart3, KeyRound, ScrollText, Store } from "lucide-react";
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
      title: t("apikey_lookup.landing_feature_usage_title", {
        defaultValue: "用量看板",
      }),
      desc: t("apikey_lookup.landing_feature_usage_desc", {
        defaultValue: "热力图、模型分布与每日趋势。",
      }),
    },
    {
      icon: ScrollText,
      title: t("apikey_lookup.landing_feature_logs_title", {
        defaultValue: "请求日志",
      }),
      desc: t("apikey_lookup.landing_feature_logs_desc", {
        defaultValue: "按模型与状态筛选，定位失败与延迟。",
      }),
    },
    {
      icon: Store,
      title: t("apikey_lookup.landing_feature_models_title", {
        defaultValue: "模型广场",
      }),
      desc: t("apikey_lookup.landing_feature_models_desc", {
        defaultValue: "浏览可用模型与价格，支持搜索复制。",
      }),
    },
  ] as const;

  return (
    <section
      data-testid="apikey-lookup-landing"
      className="mx-auto flex w-full max-w-3xl flex-col items-center px-1 py-10 text-center sm:py-16"
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-900 shadow-sm dark:border-white/10 dark:bg-neutral-950/70 dark:text-white">
        <KeyRound size={20} strokeWidth={1.75} aria-hidden />
      </div>

      <h1 className="mt-6 max-w-xl text-balance text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
        {t("apikey_lookup.landing_title", {
          defaultValue: "登录后进入用量控制台",
        })}
      </h1>

      <p className="mt-3 max-w-lg text-pretty text-sm leading-relaxed text-slate-500 dark:text-white/55 sm:text-base">
        {t("apikey_lookup.landing_desc", {
          defaultValue: "使用账号密码登录，查看用量、请求日志、模型广场，并管理 API Key。",
        })}
      </p>

      <div className="mt-8">
        <Button
          type="button"
          variant="primary"
          onClick={onLogin}
          className="h-11 rounded-full px-7 text-sm font-semibold shadow-sm active:scale-[0.98]"
        >
          {t("apikey_lookup.landing_cta", { defaultValue: "登录" })}
        </Button>
      </div>

      <ul className="mt-12 grid w-full gap-3 text-left sm:grid-cols-3 sm:gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <li
              key={feature.title}
              className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-white/[0.08] dark:bg-white/[0.03]"
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
  );
}
