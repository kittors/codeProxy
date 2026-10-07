import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { BRAND_NAME, Wordmark } from "@code-proxy/assets";
import { LandingButton } from "./LandingButton";
import { useLandingFade } from "./landingMotion";
import type { LandingCopy } from "./landingCopy";

export function LandingClosing({
  copy,
  onLogin,
  onBrowseModels,
}: {
  copy: LandingCopy;
  onLogin: () => void;
  onBrowseModels: () => void;
}) {
  const fade = useLandingFade();

  return (
    <>
      {/*
        整块反色收尾：浅色主题通篇是白与浅灰，末尾压一块深色能明确「读完了，该行动了」，
        同时给浅色页面一个必要的重量。深色主题下用一层极淡的白色叠层与画布区分——
        不再铺彩色光晕，只留细点阵的质感。
      */}
      <section className="relative overflow-hidden bg-slate-950 py-28 dark:bg-white/[0.03] lg:py-40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]"
        />

        <motion.div
          {...fade({ distance: 20 })}
          className="relative mx-auto w-full max-w-screen-xl px-5 text-center sm:px-8 lg:px-10"
        >
          <h2 className="mx-auto max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            {copy.closing.title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-white/60">
            {copy.closing.subtitle}
          </p>
          <div className="mt-11 flex flex-wrap items-center justify-center gap-3">
            <LandingButton tone="invert" onClick={onLogin}>
              {copy.closing.cta}
            </LandingButton>
            <button
              type="button"
              onClick={onBrowseModels}
              className="group inline-flex h-12 items-center gap-1.5 px-4 text-sm font-semibold text-white/70 transition-colors duration-150 hover:text-white"
            >
              {copy.closing.secondary}
              <ArrowRight
                size={16}
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-slate-900/8 py-12 dark:border-white/8">
        <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-5 px-5 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left lg:px-10">
          <Wordmark
            markSize={22}
            className="text-base text-slate-900 dark:text-white"
            textClassName="font-display text-base"
          />
          <p className="font-display text-xs text-slate-400 dark:text-white/35">
            {copy.footer.tagline}
          </p>
          <p className="font-display text-xs text-slate-400 dark:text-white/35">
            {BRAND_NAME} · {copy.footer.rights}
          </p>
        </div>
      </footer>
    </>
  );
}
