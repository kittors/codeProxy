import { type ReactNode } from "react";
import { Cloud, SquareTerminal } from "lucide-react";
import iconGemini from "@code-proxy/assets/icons/gemini.svg";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import iconCline from "@code-proxy/assets/icons/cline.svg";
import iconVertex from "@code-proxy/assets/icons/vertex.svg";
import iconOllama from "@code-proxy/assets/icons/ollama.svg";
import iconAmp from "@code-proxy/assets/icons/amp.svg";
import iconOpenai from "@code-proxy/assets/icons/openai.svg";
import iconOpenCodeDark from "@code-proxy/assets/icons/opencode-dark.svg";
import iconOpenCodeLight from "@code-proxy/assets/icons/opencode-light.svg";
import { TabsList, TabsTrigger, brandVars } from "@code-proxy/ui";

export type ProviderTabId =
  | "gemini"
  | "claude"
  | "codex"
  | "opencode-go"
  | "cline"
  | "ollama-cloud"
  | "commandcode"
  | "vertex"
  | "bedrock"
  | "openai"
  | "ampcode";

export type ProviderTabMeta = {
  id: ProviderTabId;
  label: string;
  icon?: ReactNode;
  count: number | null;
};

const TAB_META: Record<ProviderTabId, { icon: ReactNode }> = {
  gemini: { icon: <img src={iconGemini} alt="" className="size-4" /> },
  claude: { icon: <img src={iconClaude} alt="" className="size-4" /> },
  codex: {
    icon: (
      <>
        <img src={iconCodex} alt="" className="size-4 dark:hidden" />
        <img src={iconCodex} alt="" className="hidden size-4 dark:block" />
      </>
    ),
  },
  "opencode-go": {
    icon: (
      <>
        <img src={iconOpenCodeLight} alt="" className="size-4 dark:hidden" />
        <img src={iconOpenCodeDark} alt="" className="hidden size-4 dark:block" />
      </>
    ),
  },
  cline: { icon: <img src={iconCline} alt="" className="size-4" /> },
  "ollama-cloud": { icon: <img src={iconOllama} alt="" className="size-4" /> },
  // Command Code ships no brand mark in this repo; a terminal glyph matches its
  // CLI identity, the same way Bedrock falls back to a cloud glyph.
  commandcode: { icon: <SquareTerminal size={16} /> },
  vertex: { icon: <img src={iconVertex} alt="" className="size-4" /> },
  bedrock: { icon: <Cloud size={16} /> },
  openai: {
    icon: (
      <>
        <img src={iconOpenai} alt="" className="size-4 dark:hidden" />
        <img src={iconOpenai} alt="" className="hidden size-4 dark:block" />
      </>
    ),
  },
  ampcode: { icon: <img src={iconAmp} alt="" className="size-4" /> },
};

/**
 * tab 上的数量角标跟着供应商的品牌色：当前 tab 用品牌实色，其余用品牌淡底。淡底是和卡片底色
 * 混出来的实色而不是半透明——角标压在 tab 文字上，半透明会透出下面的字。认不出品牌的
 * （Bedrock、Command Code）回落到墨色，和以前一样是黑 / 灰。
 */
const COUNT_BADGE_BASE =
  "absolute -right-0.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold leading-none tabular-nums shadow-sm ring-1";
const COUNT_BADGE_ACTIVE =
  "bg-[var(--brand-fill)] text-[var(--brand-on)] ring-black/10 dark:ring-white/15";
const COUNT_BADGE_IDLE =
  "bg-[color-mix(in_oklab,var(--brand)_14%,var(--color-surface))] text-[var(--brand-text)] ring-[color-mix(in_oklab,var(--brand)_24%,transparent)] dark:bg-[color-mix(in_oklab,var(--brand)_26%,var(--color-surface))]";

type ProviderTabsWithCountsProps = {
  tabs: ProviderTabMeta[];
  value: ProviderTabId;
};

export function ProviderTabsWithCounts({ tabs, value }: ProviderTabsWithCountsProps) {
  return (
    <div className="flex shrink-0">
      <TabsList>
        {tabs.map((tab) => {
          const icon = tab.icon ?? TAB_META[tab.id]?.icon ?? null;
          const brand = brandVars(tab.id);
          return (
            <TabsTrigger key={tab.id} value={tab.id}>
              {icon}
              <span className="relative inline-flex items-center pr-4">
                {tab.label}
                {tab.count !== null && tab.count > 0 ? (
                  <span
                    style={brand.style}
                    className={[
                      brand.className,
                      COUNT_BADGE_BASE,
                      value === tab.id ? COUNT_BADGE_ACTIVE : COUNT_BADGE_IDLE,
                    ].join(" ")}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}
