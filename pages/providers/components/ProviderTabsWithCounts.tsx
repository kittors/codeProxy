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
import { TabsList, TabsTrigger } from "@code-proxy/ui";

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
 * tab 上的数量角标：当前 tab 用强调色实底，其余是卡片底色的白（深色是卡片色）小圆点，都不描边。
 * 以前按供应商品牌色上色，一条页签上十几个角标十几种颜色；认厂商靠 tab 里的 logo 就够了。
 * 角标压在 tab 文字上，所以必须是不透明的实色，半透明会透出下面的字。
 */
const COUNT_BADGE_BASE =
  "absolute -right-0.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold leading-none tabular-nums";
const COUNT_BADGE_ACTIVE = "bg-accent text-accent-fg";
const COUNT_BADGE_IDLE = "bg-surface text-ink-2 shadow-xs";

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
          return (
            <TabsTrigger key={tab.id} value={tab.id}>
              {icon}
              <span className="relative inline-flex items-center pr-4">
                {tab.label}
                {tab.count !== null && tab.count > 0 ? (
                  <span
                    className={[
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
