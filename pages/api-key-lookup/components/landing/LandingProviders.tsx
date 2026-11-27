import { VendorIcon } from "@code-proxy/assets";
import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy } from "./landingCopy";

/**
 * 厂商墙取自实际已接入的图标集，不是宣传性列举——页面上出现的每一个都能在
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
  return (
    <section className="border-t border-sn-line py-16 lg:py-20">
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6">
        <LandingSectionHead
          index="01"
          eyebrow={copy.providers.eyebrow}
          title={copy.providers.title}
        />

        {/* 严丝合缝 1px 发丝网格（gap-px 无双边线）：20 家已接入上游与客户端一目了然 */}
        <ul className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sn-line bg-sn-line sm:grid-cols-4 lg:grid-cols-5">
          {PROVIDERS.map((provider) => (
            <li
              key={provider.id}
              className="group flex items-center gap-2.5 bg-sn-raised px-4 py-3.5 transition-colors duration-150 hover:bg-sn-hover/70"
            >
              <span className="inline-flex shrink-0 transition-transform duration-150 group-hover:-translate-y-0.5">
                <VendorIcon modelId={provider.id} size={18} />
              </span>
              <span className="truncate font-sans text-sm font-medium text-sn-label2 transition-colors duration-150 group-hover:text-sn-label">
                {provider.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
