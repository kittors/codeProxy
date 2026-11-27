import { useCallback, useState } from "react";
import { Icon } from "satin-ui/react";
import { VendorIcon } from "@code-proxy/assets";
import { copyTextToClipboard } from "@code-proxy/ui";
import { LandingButton } from "./LandingButton";
import { LandingConsole } from "./LandingConsole";
import type { LandingCopy } from "./landingCopy";

const COPIED_RESET_MS = 1800;

/** 右侧信息栏列出的上游厂商。与厂商墙同源，都取自实际已接入的图标集。 */
const RAIL_VENDORS = [
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "GPT" },
  { id: "grok", label: "Grok" },
  { id: "qwen", label: "Qwen" },
  { id: "deepseek", label: "DeepSeek" },
] as const;

export function LandingHero({
  copy,
  onLogin,
  onBrowseModels,
}: {
  copy: LandingCopy;
  onLogin: () => void;
  onBrowseModels: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const command = `export OPENAI_BASE_URL=${copy.apiBaseUrl}`;

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(command).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    });
  }, [command]);

  return (
    <section className="relative overflow-hidden pt-20 sm:pt-28 lg:pt-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle,rgba(15,23,42,0.10)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(75%_65%_at_50%_0%,#000_10%,transparent_75%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.08)_1px,transparent_1px)]"
      />

      <div className="relative mx-auto w-full max-w-screen-xl px-5 sm:px-8 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
          <div>
            <p className="sn-fade-up font-display text-xs uppercase tracking-[0.1em] text-ink-3">
              {copy.hero.badge}
            </p>

            <h1
              className="sn-fade-up mt-7 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              <span className="block">{copy.hero.titleLine1}</span>
              <span className="mt-2 block text-ink-3">
                {copy.hero.titleLine2}
              </span>
            </h1>

            <p
              className="sn-fade-up mt-8 max-w-2xl text-base leading-8 text-ink-2"
              style={{ animationDelay: "120ms" }}
            >
              {copy.hero.description}
            </p>

            <div
              className="sn-fade-up mt-10 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <LandingButton onClick={onLogin}>{copy.hero.primaryCta}</LandingButton>

              <div className="cp-edge inline-flex h-12 items-center gap-3 rounded-[var(--sn-btn-r)] bg-[#0B0D13] pl-4 pr-2">
                <code className="max-w-[13rem] truncate font-mono text-xs text-slate-300 sm:max-w-none sm:text-sm">
                  <span className="text-white/45 colorful:text-emerald-400">$ </span>
                  {command}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? copy.workflow.copied : copy.workflow.copy}
                  className="sn-btn sn-ghost sn-sm sn-ibtn shrink-0 !text-white/65 hover:!bg-white/10 hover:!text-white"
                >
                  <span className={copied ? "sn-swap sn-on" : "sn-swap"}>
                    <span className="sn-a">
                      <Icon name="copy" size={15} />
                    </span>
                    <span className="sn-b text-emerald-400">
                      <Icon name="check" size={15} />
                    </span>
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={onBrowseModels}
                className="sn-btn sn-ghost group !h-12 !px-4 !text-sm font-semibold text-[var(--sn-label2)]"
              >
                {copy.hero.secondaryCta}
                <Icon
                  name="arrow-right"
                  size={16}
                  className="transition-transform duration-200 ease-[var(--sn-ease-out-strong)] group-hover:translate-x-1"
                />
              </button>
            </div>
          </div>

          <aside className="sn-fade-up lg:pt-2" style={{ animationDelay: "220ms" }}>
            <p className="font-display text-2xs uppercase tracking-[0.1em] text-ink-3">
              {copy.hero.railTitle}
            </p>
            <ul className="mt-5">
              {RAIL_VENDORS.map((vendor) => (
                <li
                  key={vendor.id}
                  className="flex items-center gap-3 border-t border-line py-3 text-sm text-ink-2 first:border-t-0"
                >
                  <VendorIcon modelId={vendor.id} size={17} />
                  {vendor.label}
                </li>
              ))}
              <li className="border-t border-line pt-3">
                <button
                  type="button"
                  onClick={onBrowseModels}
                  className="font-display text-xs text-ink-2 transition-colors duration-150 hover:text-ink"
                >
                  {copy.hero.railMore}
                </button>
              </li>
            </ul>
          </aside>
        </div>
      </div>

      <LandingConsole copy={copy} />
    </section>
  );
}
