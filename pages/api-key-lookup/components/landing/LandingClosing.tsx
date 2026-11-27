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
      <section className="border-t border-sn-line py-16 lg:py-20">
        <LandingFade
          distance={14}
          className="mx-auto w-full max-w-screen-xl px-4 text-center sm:px-6"
        >
          <h2 className="mx-auto max-w-2xl font-sans text-2xl font-semibold leading-tight tracking-[-0.025em] text-sn-label sm:text-3xl">
            {copy.closing.title}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-sn-label2 sm:text-base">
            {copy.closing.subtitle}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <LandingButton onClick={onLogin}>{copy.closing.cta}</LandingButton>
            <button
              type="button"
              onClick={onBrowseModels}
              className="sn-btn sn-ghost group !h-10 gap-1.5 !px-3.5 !text-sm font-medium text-sn-label2"
            >
              {copy.closing.secondary}
              <SatinIcon
                name="arrow-right"
                size={15}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </div>
        </LandingFade>
      </section>

      <footer className="border-t border-sn-line py-8">
        <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <Wordmark
            markSize={22}
            className="text-sm text-sn-label"
            textClassName="text-sm"
          />
          <p className="text-xs text-sn-label3">{copy.footer.tagline}</p>
          <p className="text-xs text-sn-label3">
            {BRAND_NAME} · {copy.footer.rights}
          </p>
        </div>
      </footer>
    </>
  );
}
