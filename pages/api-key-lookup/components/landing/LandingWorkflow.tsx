import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import {
  copyTextToClipboard,
  highlightSnippet,
  TOKEN_CLASS,
  type SnippetLanguage,
} from "@code-proxy/ui";
import { LANDING_EASE, useLandingFade } from "./landingMotion";
import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy } from "./landingCopy";

const COPIED_RESET_MS = 1800;

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

export function LandingWorkflow({ copy }: { copy: LandingCopy }) {
  const fade = useLandingFade();
  const snippets = useMemo(() => buildSnippets(copy.apiBaseUrl), [copy.apiBaseUrl]);
  const [activeId, setActiveId] = useState<string>(snippets[0].id);
  const [copied, setCopied] = useState(false);

  const active = snippets.find((snippet) => snippet.id === activeId) ?? snippets[0];
  const highlighted = useMemo(
    () => highlightSnippet(active.code, active.language),
    [active.code, active.language],
  );

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(active.code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      // 只做视觉反馈，不额外弹 toast——落地页此处没有登录态，toast 容器未必挂载。
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    });
  }, [active.code]);

  return (
    // 和厂商墙一样靠一层底色与相邻段落分开，不画通栏分隔线。
    <section className="bg-white py-28 dark:bg-white/[0.015] lg:py-40">
      <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-8 lg:px-10">
        <LandingSectionHead
          index="03"
          eyebrow={copy.workflow.eyebrow}
          title={copy.workflow.title}
          subtitle={copy.workflow.subtitle}
        />

        <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <ol>
            {copy.workflow.steps.map((step, index) => (
              <motion.li
                key={step.title}
                {...fade({ delay: 0.06 * index, distance: 12 })}
                className="border-t border-line py-7 first:border-t-0 first:pt-0"
              >
                <span className="font-display text-2xs uppercase tracking-[0.28em] text-ink-3">
                  {`STEP ${index + 1}`}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-7 text-ink-2">
                  {step.desc}
                </p>
              </motion.li>
            ))}
          </ol>

          <motion.div
            {...fade({ delay: 0.1 })}
            // 代码面板两种主题下都是深底；轮廓用伪元素细边，页签条与代码之间靠留白分开。
            className="cp-edge overflow-hidden rounded-3xl bg-[#0B0D13]"
          >
            <div className="flex items-center gap-1 px-3 pt-2.5">
              {snippets.map((snippet) => (
                <button
                  key={snippet.id}
                  type="button"
                  onClick={() => setActiveId(snippet.id)}
                  aria-pressed={snippet.id === activeId}
                  className={[
                    "relative rounded-full px-4 py-1.5 font-display text-xs font-medium transition-colors duration-150",
                    snippet.id === activeId
                      ? "text-white"
                      : "text-white/55 hover:text-white/85",
                  ].join(" ")}
                >
                  {snippet.id === activeId ? (
                    <motion.span
                      layoutId="landing-snippet-tab"
                      transition={{ duration: 0.28, ease: LANDING_EASE }}
                      aria-hidden
                      className="absolute inset-0 -z-10 rounded-full bg-accent"
                    />
                  ) : null}
                  {snippet.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleCopy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-xs font-medium text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white/85"
              >
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                {copied ? copy.workflow.copied : copy.workflow.copy}
              </button>
            </div>

            <pre className="overflow-x-auto px-6 py-6 font-mono text-xs leading-7 sm:text-sm">
              <code>
                {highlighted.map((tokens, lineIndex) => (
                  <span key={lineIndex} className="block">
                    {/* 空行没有 token，补一个零宽字符撑住行高，避免代码块出现塌陷。 */}
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
          </motion.div>
        </div>
      </div>
    </section>
  );
}
