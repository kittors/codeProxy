import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { initSeg } from "satin-ui";
import { Icon } from "satin-ui/react";
import { VendorIcon } from "@code-proxy/assets";
import {
  copyTextToClipboard,
  highlightSnippet,
  TOKEN_CLASS,
  type SnippetLanguage,
} from "@code-proxy/ui";
import { LandingButton } from "./LandingButton";
import type { LandingCopy } from "./landingCopy";

const COPIED_RESET_MS = 1800;

/** 交互代码台底栏展示的核心已接入上游图标。 */
const FEATURED_VENDORS = [
  { id: "claude", label: "Claude" },
  { id: "openai", label: "GPT" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "grok", label: "Grok" },
  { id: "qwen", label: "Qwen" },
] as const;

function buildSnippets(baseUrl: string) {
  return [
    {
      id: "curl",
      label: "cURL",
      language: "shell" as SnippetLanguage,
      code: [
        `curl ${baseUrl}/chat/completions \\`,
        `  -H "Authorization: Bearer $CLIRELAY_API_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{`,
        `    "model": "claude-sonnet-5",`,
        `    "messages": [{"role": "user", "content": "Hello"}]`,
        `  }'`,
      ].join("\n"),
    },
    {
      id: "python",
      label: "Python",
      language: "python" as SnippetLanguage,
      code: [
        `import os`,
        `from openai import OpenAI`,
        ``,
        `client = OpenAI(`,
        `    base_url="${baseUrl}",`,
        `    api_key=os.environ["CLIRELAY_API_KEY"],`,
        `)`,
        ``,
        `resp = client.chat.completions.create(`,
        `    model="claude-sonnet-5",`,
        `    messages=[{"role": "user", "content": "Hello"}],`,
        `)`,
      ].join("\n"),
    },
    {
      id: "node",
      label: "Node.js",
      language: "javascript" as SnippetLanguage,
      code: [
        `import OpenAI from "openai";`,
        ``,
        `const client = new OpenAI({`,
        `  baseURL: "${baseUrl}",`,
        `  apiKey: process.env.CLIRELAY_API_KEY,`,
        `});`,
        ``,
        `const resp = await client.chat.completions.create({`,
        `  model: "claude-sonnet-5",`,
        `  messages: [{ role: "user", content: "Hello" }],`,
        `});`,
      ].join("\n"),
    },
  ] as const;
}

export function LandingHero({
  copy,
  onLogin,
  onBrowseModels,
}: {
  copy: LandingCopy;
  onLogin: () => void;
  onBrowseModels: () => void;
}) {
  const [cmdCopied, setCmdCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const snippets = useMemo(() => buildSnippets(copy.apiBaseUrl), [copy.apiBaseUrl]);
  const [activeId, setActiveId] = useState<string>(snippets[0].id);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const segRef = useRef<ReturnType<typeof initSeg> | null>(null);

  const activeIdx = Math.max(
    0,
    snippets.findIndex((snippet) => snippet.id === activeId),
  );
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;

  useLayoutEffect(() => {
    const el = tabListRef.current;
    if (!el) return undefined;
    const api = initSeg(el, undefined, activeIdxRef.current, {
      role: "none",
      controlled: true,
      fitScroll: false,
      keyboard: false,
    });
    segRef.current = api;
    return () => {
      api.destroy();
      if (segRef.current === api) segRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    segRef.current?.sync(activeIdx, false);
  }, [activeIdx]);

  const active = snippets.find((snippet) => snippet.id === activeId) ?? snippets[0];
  const highlighted = useMemo(
    () => highlightSnippet(active.code, active.language),
    [active.code, active.language],
  );

  const command = `export OPENAI_BASE_URL=${copy.apiBaseUrl}`;

  const handleCopyCommand = useCallback(() => {
    void copyTextToClipboard(command).then((ok) => {
      if (!ok) return;
      setCmdCopied(true);
      window.setTimeout(() => setCmdCopied(false), COPIED_RESET_MS);
    });
  }, [command]);

  const handleCopyCode = useCallback(() => {
    void copyTextToClipboard(active.code).then((ok) => {
      if (!ok) return;
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), COPIED_RESET_MS);
    });
  }, [active.code]);

  return (
    <section className="relative pt-14 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24">
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)] lg:gap-14">
          <div className="min-w-0">
            <div className="sn-fade-up inline-flex items-center gap-2 text-xs font-medium text-sn-label3">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rotate-45 bg-emerald-500"
              />
              <span>{copy.hero.badge}</span>
            </div>

            <h1
              className="sn-fade-up mt-5 font-sans text-4xl font-semibold leading-[1.12] tracking-[-0.03em] text-sn-label sm:text-5xl"
              style={{ animationDelay: "50ms" }}
            >
              <span className="block">{copy.hero.titleLine1}</span>
              <span className="mt-1.5 block text-sn-label3">{copy.hero.titleLine2}</span>
            </h1>

            <p
              className="sn-fade-up mt-5 max-w-xl text-sm leading-7 text-sn-label2 sm:text-base"
              style={{ animationDelay: "100ms" }}
            >
              {copy.hero.description}
            </p>

            <div
              className="sn-fade-up mt-7 flex flex-wrap items-center gap-2.5"
              style={{ animationDelay: "140ms" }}
            >
              <LandingButton onClick={onLogin}>{copy.hero.primaryCta}</LandingButton>

              <button
                type="button"
                onClick={onBrowseModels}
                className="sn-btn sn-ghost group !h-10 !px-3.5 !text-sm font-medium text-sn-label2"
              >
                {copy.hero.secondaryCta}
                <Icon
                  name="arrow-right"
                  size={15}
                  className="transition-transform duration-200 ease-[var(--sn-ease-out-strong)] group-hover:translate-x-1"
                />
              </button>
            </div>

            <div
              className="sn-fade-up mt-7 max-w-lg"
              style={{ animationDelay: "180ms" }}
            >
              <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-sn-line bg-sn-raised pl-3.5 pr-1.5">
                <code className="min-w-0 truncate font-mono text-xs text-sn-label2">
                  <span className="select-none text-sn-label3">$ </span>
                  {command}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCommand}
                  aria-label={cmdCopied ? copy.workflow.copied : copy.workflow.copy}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sn-label3 transition-[background-color,color,transform] duration-150 hover:bg-sn-hover hover:text-sn-label active:scale-95"
                >
                  <span className={cmdCopied ? "sn-swap sn-on" : "sn-swap"}>
                    <span className="sn-a">
                      <Icon name="copy" size={14} />
                    </span>
                    <span className="sn-b text-emerald-500">
                      <Icon name="check" size={14} />
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 真实可交互的多语言接入演示台：替代伪造数据的静态看板，进首屏即可切换语言并复制真实端点 */}
          <div
            className="sn-fade-up min-w-0 overflow-hidden rounded-xl border border-sn-line bg-[#111318] dark:bg-[#0D0F13]"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
              <div ref={tabListRef} className="relative flex items-center gap-0.5 p-0.5">
                <span
                  aria-hidden="true"
                  className="sn-thumb pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 z-0 origin-left rounded-md bg-white/[0.12] opacity-0 will-change-transform"
                />
                {snippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    onClick={() => setActiveId(snippet.id)}
                    aria-pressed={snippet.id === activeId}
                    className={[
                      "relative z-[1] rounded-md px-3 py-1 font-sans text-xs font-medium transition-colors duration-150",
                      snippet.id === activeId
                        ? "text-white"
                        : "text-white/55 hover:text-white/85",
                    ].join(" ")}
                  >
                    {snippet.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white/60 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.08] hover:text-white active:scale-95"
              >
                <span className={codeCopied ? "sn-swap sn-on" : "sn-swap"} aria-hidden="true">
                  <span className="sn-a">
                    <Icon name="copy" size={13} />
                  </span>
                  <span className="sn-b text-emerald-400">
                    <Icon name="check" size={13} />
                  </span>
                </span>
                <span>{codeCopied ? copy.workflow.copied : copy.workflow.copy}</span>
              </button>
            </div>

            <pre
              key={active.id}
              className="sn-fade-up overflow-x-auto px-5 py-5 font-mono text-xs leading-6 sm:leading-7"
            >
              <code>
                {highlighted.map((tokens, lineIndex) => (
                  <span key={lineIndex} className="block">
                    {tokens.length === 0 ? "\u200b" : null}
                    {tokens.map((token, tokenIndex) => (
                      <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                ))}
              </code>
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-white/[0.02] px-5 py-2.5">
              <span className="font-mono text-2xs text-white/45">
                OpenAI Compatible · /v1/chat/completions
              </span>
              <div className="flex items-center gap-2.5" aria-label={copy.hero.railTitle}>
                {FEATURED_VENDORS.map((vendor) => (
                  <span
                    key={vendor.id}
                    title={vendor.label}
                    className="inline-flex opacity-80 transition-opacity duration-150 hover:opacity-100"
                  >
                    <VendorIcon modelId={vendor.id} size={15} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
