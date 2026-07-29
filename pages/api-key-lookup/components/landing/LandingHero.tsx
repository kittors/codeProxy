import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Copy } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { copyTextToClipboard } from "@code-proxy/ui";
import { LANDING_EASE } from "./landingMotion";
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
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const command = `export OPENAI_BASE_URL=${copy.apiBaseUrl}`;

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(command).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    });
  }, [command]);

  // 首屏挂载即可见，用 animate 而非 whileInView：等 IntersectionObserver 回调会闪一帧空白。
  const enter = (delay: number) =>
    reduceMotion
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: LANDING_EASE },
        };

  return (
    <section className="relative overflow-hidden pt-20 sm:pt-28 lg:pt-32">
      {/*
        点阵而不是弥散光晕：几何图案在浅色底上能提供质感又不糊，
        顶部径向遮罩让它从视口上沿淡出，不与顶栏抢注意力。
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle,rgba(15,23,42,0.10)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(75%_65%_at_50%_0%,#000_10%,transparent_75%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.08)_1px,transparent_1px)]"
      />

      <div className="relative mx-auto w-full max-w-screen-xl px-5 sm:px-8 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
          <div>
            <motion.p
              {...enter(0)}
              className="font-display text-xs uppercase tracking-[0.1em] text-indigo-600 dark:text-indigo-400"
            >
              {copy.hero.badge}
            </motion.p>

            <motion.h1
              {...enter(0.06)}
              className="mt-7 font-display text-4xl font-bold leading-[1.1] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl"
            >
              <span className="block">{copy.hero.titleLine1}</span>
              <span className="mt-2 block text-indigo-600 dark:text-indigo-400">
                {copy.hero.titleLine2}
              </span>
            </motion.h1>

            <motion.p
              {...enter(0.12)}
              className="mt-8 max-w-2xl text-base leading-8 text-slate-600 dark:text-white/55"
            >
              {copy.hero.description}
            </motion.p>

            <motion.div {...enter(0.18)} className="mt-10 flex flex-wrap items-center gap-3">
              <LandingButton onClick={onLogin}>{copy.hero.primaryCta}</LandingButton>

              {/* 可复制的接入命令：既是 CTA 也是产品说明，比再放一个按钮更有信息量。 */}
              <div className="inline-flex h-12 items-center gap-3 rounded-full bg-[#0B0D13] pl-5 pr-2 ring-1 ring-slate-900/10 dark:ring-white/10">
                <code className="max-w-[13rem] truncate font-mono text-xs text-slate-300 sm:max-w-none sm:text-sm">
                  <span className="text-emerald-400">$ </span>
                  {command}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? copy.workflow.copied : copy.workflow.copy}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors duration-150 hover:bg-white/10 hover:text-white/80"
                >
                  {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                </button>
              </div>

              <button
                type="button"
                onClick={onBrowseModels}
                className="group inline-flex h-12 items-center gap-1.5 px-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:text-indigo-600 dark:text-white/70 dark:hover:text-indigo-400"
              >
                {copy.hero.secondaryCta}
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </button>
            </motion.div>
          </div>

          {/* 右侧信息栏：细分隔线 + 等宽标签，把「已接入哪些上游」当成事实清单直接摆出来。 */}
          <motion.aside {...enter(0.24)} className="lg:pt-2">
            <p className="font-display text-2xs uppercase tracking-[0.1em] text-slate-400 dark:text-white/35">
              {copy.hero.railTitle}
            </p>
            <ul className="mt-5">
              {RAIL_VENDORS.map((vendor) => (
                <li
                  key={vendor.id}
                  className="flex items-center gap-3 border-t border-slate-900/8 py-3 text-sm text-slate-700 first:border-t-0 dark:border-white/8 dark:text-white/70"
                >
                  <VendorIcon modelId={vendor.id} size={17} />
                  {vendor.label}
                </li>
              ))}
              <li className="border-t border-slate-900/8 pt-3 dark:border-white/8">
                <button
                  type="button"
                  onClick={onBrowseModels}
                  className="font-display text-xs text-indigo-600 transition-opacity duration-150 hover:opacity-70 dark:text-indigo-400"
                >
                  {copy.hero.railMore}
                </button>
              </li>
            </ul>
          </motion.aside>
        </div>
      </div>

      <LandingConsole copy={copy} />
    </section>
  );
}
