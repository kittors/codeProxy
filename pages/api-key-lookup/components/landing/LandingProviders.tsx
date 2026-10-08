import { VendorIcon } from "@code-proxy/assets";
import { surface } from "@code-proxy/ui";
import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy } from "./landingCopy";

/**
 * 走马灯里的厂商取自实际已接入的图标集，不是宣传性列举——页面上出现的每一个都能在
 * `packages/assets/src/icons` 找到对应资源，避免落地页承诺超出实现范围。
 */
const PROVIDERS = [
  { id: "claude", label: "Claude" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" },
  { id: "qwen", label: "Qwen" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "kimi", label: "Kimi" },
  { id: "glm", label: "GLM" },
  { id: "minimax", label: "MiniMax" },
  { id: "hunyuan", label: "Hunyuan" },
  { id: "mimo", label: "MiMo" },
  { id: "vertex", label: "Vertex AI" },
  { id: "codex", label: "Codex" },
  { id: "cline", label: "Cline" },
  { id: "opencode", label: "OpenCode" },
  { id: "kiro", label: "Kiro" },
  { id: "iflow", label: "iFlow" },
  { id: "ollama", label: "Ollama" },
  { id: "amp", label: "Amp" },
  { id: "antigravity", label: "Antigravity" },
] as const;

export function LandingProviders({ copy }: { copy: LandingCopy }) {
  // 整段换一层底色和上下段分开，不再在上下边各画一条通栏分隔线。
  return (
    <section className="bg-white py-28 dark:bg-white/[0.015] lg:py-40">
      <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-8 lg:px-10">
        <LandingSectionHead
          index="01"
          eyebrow={copy.providers.eyebrow}
          title={copy.providers.title}
        />
      </div>

      {/* 两侧渐隐遮罩，让循环滚动的接缝落在不可见区域。 */}
      <div className="relative mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
        <div className="flex w-max motion-safe:animate-[landing-marquee_52s_linear_infinite] motion-reduce:animate-none">
          {/* 渲染两份完全相同的序列，第一份滚完 50% 时第二份刚好接上，形成无缝循环。 */}
          {[0, 1].map((copyIndex) => (
            <ul
              key={copyIndex}
              className="flex shrink-0 items-center gap-4 pr-4"
              aria-hidden={copyIndex === 1}
            >
              {PROVIDERS.map((provider) => (
                <li
                  key={`${copyIndex}-${provider.id}`}
                  // 厂商块是卡片（伪元素细边 + 投影），不描 ring；颜色只留在厂商 logo 上。
                  className={`${surface({ radius: "2xl" })} inline-flex items-center gap-3 px-6 py-4`}
                >
                  <VendorIcon modelId={provider.id} size={22} />
                  <span className="font-display text-sm font-medium text-ink-2">
                    {provider.label}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
