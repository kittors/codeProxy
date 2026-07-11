import { type ReactNode } from "react";
import { Cloud } from "lucide-react";
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
                    className={
                      value === tab.id
                        ? "absolute -right-0.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#18181B] px-1 text-2xs font-semibold leading-none tabular-nums text-white shadow-sm ring-1 ring-black/10 dark:bg-white dark:text-[#18181B] dark:ring-white/15"
                        : "absolute -right-0.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-100 px-1 text-2xs font-semibold leading-none tabular-nums text-blue-700 shadow-sm ring-1 ring-blue-200/80 dark:bg-blue-500/25 dark:text-blue-100 dark:ring-blue-300/25"
                    }
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
