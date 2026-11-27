import { Icon as SatinIcon } from "satin-ui/react";
import { BRAND_NAME, Wordmark } from "@code-proxy/assets";
import { LandingButton } from "./LandingButton";
import { LandingFade } from "./landingMotion";
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
  return (
    <>
      <section className="relative overflow-hidden bg-slate-950 py-28 dark:bg-white/[0.03] lg:py-40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]"
        />

        <LandingFade
          distance={20}
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
              className="sn-btn sn-ghost group !h-12 gap-1.5 !rounded-full !px-4 !text-sm font-semibold !text-white/70 hover:!bg-white/10 hover:!text-white"
            >
              {copy.closing.secondary}
              <SatinIcon
                name="arrow-right"
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </div>
        </LandingFade>
      </section>

      <footer className="py-12">
        <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-5 px-5 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left lg:px-10">
          <Wordmark
            markSize={22}
            className="text-base text-sn-label"
            textClassName="font-display text-base"
          />
          <p className="font-display text-xs text-sn-label3">{copy.footer.tagline}</p>
          <p className="font-display text-xs text-sn-label3">
            {BRAND_NAME} · {copy.footer.rights}
          </p>
        </div>
      </footer>
    </>
  );
}
